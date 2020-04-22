/* Copyright 2019 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
const addon = require('nodencl')
const request = require('request-promise-native')
const Koa = require('koa')
const cors = require('@koa/cors')
const beamcoder = require('beamcoder')
const rgbrgb = require('../process/rgbrgbPacker.js')
const rgbyuv = require('../process/rgbyuvPacker.js')
const bgra8_io = require('../process/bgra8_io.js')
const v210_io = require('../process/v210_io.js')

const compositeKernel = `
  __kernel void composite(__global float16* restrict bgIn,
                          __global float16* restrict ovIn,
                          __global float16* restrict output,
                          __private unsigned int width,
                          __private unsigned int ppwi) {
    uint rem =  width % ppwi;
    bool lastItemOnLine = get_local_id(0) == get_local_size(0) - 1;
    const uint numPixels = (0 != rem) && lastItemOnLine ? rem : ppwi;

    // 4 pixels per loop
    const uint ppl = 4;
    const uint numLoops = numPixels / ppl;
    uint off = (width * get_group_id(0) + get_local_id(0) * ppwi) / ppl;

    for (uint i=0; i<numLoops; ++i) {
      float16 bg = bgIn[off];
      float16 ov = ovIn[off];

      float4 k = (float4)((1.0f - ov.s3), (1.0f - ov.s7), (1.0f - ov.sb), (1.0f - ov.sf));
      float16 k16 = (float16)(k.s0, k.s0, k.s0, 0.0f, k.s1, k.s1, k.s1, 0.0f, k.s2, k.s2, k.s2, 0.0f, k.s3, k.s3, k.s3, 0.0f);
      float16 rgba = fma(bg, k16, ov);
      output[off] = rgba;

      off++;
    }
  }
`

const kapp = new Koa()
kapp.use(cors())

const width = 1920
const height = 1080
const pixelsPerWorkItem = 128

let bgra8Loader
// let bgra8Saver;
let v210Loader
let v210Saver
let v210Src
let bgra8Src
let rgbaBG
let rgbaOV
let rgbaDst
// let bgra8Dst;
let v210Dst
let compProgram
let lastBuf

async function processFrame(bg, overlay) {
	// let start = process.hrtime();
	await v210Src.hostAccess('writeonly', bg)
	await bgra8Src.hostAccess('writeonly', overlay)

	// eslint-disable-next-line no-unused-vars
	let timings
	timings = await v210Loader.fromYUV({ source: v210Src, dest: rgbaBG })
	// console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

	timings = await bgra8Loader.fromRGB({ source: bgra8Src, dest: rgbaOV })
	// console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

	timings = await compProgram.run({
		bgIn: rgbaBG,
		ovIn: rgbaOV,
		output: rgbaDst,
		width: width,
		ppwi: pixelsPerWorkItem
	})
	// console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

	timings = await v210Saver.toYUV({ source: rgbaDst, dest: v210Dst })
	// console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

	await v210Dst.hostAccess('readonly')
	v210Dst.copy(lastBuf)

	// let end = process.hrtime(start);
	// console.log('OpenCL:', end);
}

// eslint-disable-next-line no-unused-vars
let timer = (w) =>
	new Promise((resolve) => {
		setTimeout(resolve, w)
	})

async function init() {
	const platformIndex = 1
	const deviceIndex = 0
	const context = new addon.clContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex
	})
	const platformInfo = await context.getPlatformInfo()
	console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type)

	let demuxer = await beamcoder.demuxer('../../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	await demuxer.seek({ time: 40 })
	let decoder = beamcoder.decoder({ name: 'h264' })
	let encParams = {
		name: 'v210',
		width: width,
		height: height,
		time_base: [1, 25],
		framerate: [25, 1],
		pix_fmt: 'yuv422p10le'
	}
	let encoder = beamcoder.encoder(encParams)

	const bgColSpecRead = '709'
	const ovColSpecRead = 'sRGB'
	const colSpecWrite = '709'

	v210Loader = new rgbyuv.yuvLoader(
		context,
		bgColSpecRead,
		colSpecWrite,
		new v210_io.reader(width, height)
	)
	await v210Loader.init()
	v210Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new v210_io.writer(width, height))
	await v210Saver.init()

	bgra8Loader = new rgbrgb.rgbLoader(
		context,
		ovColSpecRead,
		colSpecWrite,
		new bgra8_io.reader(width, height)
	)
	await bgra8Loader.init()

	const numBytesV210 = v210_io.getPitchBytes(width) * height
	v210Src = await context.createBuffer(numBytesV210, 'readonly', 'fine')

	const numBytesBGRA8 = bgra8_io.getPitchBytes(width) * height
	bgra8Src = await context.createBuffer(numBytesBGRA8, 'readonly', 'fine')

	const numBytesRGBA = width * height * 4 * 4
	rgbaBG = await context.createBuffer(numBytesRGBA, 'readwrite', 'fine')
	rgbaOV = await context.createBuffer(numBytesRGBA, 'readwrite', 'fine')
	rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'fine')

	v210Dst = await context.createBuffer(numBytesV210, 'writeonly', 'fine')

	// process one image line per work group
	const workItemsPerGroup = Math.ceil(width / pixelsPerWorkItem)
	const globalWorkItems = workItemsPerGroup * height
	compProgram = await context.createProgram(compositeKernel, {
		name: 'composite',
		globalWorkItems: globalWorkItems,
		workItemsPerGroup: workItemsPerGroup
	})

	lastBuf = Buffer.alloc(numBytesV210)

	kapp.use(async (ctx) => {
		ctx.body = lastBuf
	})

	let server = kapp.listen(3001)
	process.on('SIGHUP', server.close)

	// let start = process.hrtime();
	// let counter = 0;
	let packet
	// eslint-disable-next-line no-constant-condition
	while (true) {
		// let start = process.hrtime();
		do packet = await demuxer.read()
		while (packet.stream_index !== 0)
		let frames = await decoder.decode(packet)
		let packets = await encoder.encode(frames.frames[0])
		// let end = process.hrtime(start);
		// console.log('FFmpeg:', end);

		let frame = await request('http://localhost:3000/', { encoding: null })

		await processFrame(packets.packets[0].data, frame)

		// let end = process.hrtime(start);
		// let wait = (40000000 * counter - end[1]) / 1000000 | 0;
		// await timer(wait);
	}
}

init()
