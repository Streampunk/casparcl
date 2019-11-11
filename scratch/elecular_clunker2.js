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
const addon = require('nodencl');
const request = require('request-promise-native')
const Koa = require('koa');
const cors = require('@koa/cors');
const beamcoder = require('beamcoder');
const rgbrgb = require('../process/rgbrgbPacker.js');
const rgbyuv = require('../process/rgbyuvPacker.js');
const rgba8_io = require('../process/rgba8_io.js');
const bgra8_io = require('../process/bgra8_io.js');
const v210_io = require('../process/v210_io.js');
const yuv422p10_io = require('../process/yuv422p10_io.js');
const imageProcess = require('../process/imageProcess.js');
const combine = require('../process/combine.js');
const resize = require('../process/resize.js');
const macadam = require('macadam')

const kapp = new Koa();
kapp.use(cors());

const width = 1920;
const height = 1080;
const pixelsPerWorkItem = 128;

let bgra8Loader;
let webSaver;
let v210Saver;
let srcs;
let bgra8Src;
let rgbaBG;
let rgbaOV;
let rgbaDst;
let rgbaDstWeb;
let v210Dst;
let webDst;
let lastWeb;
let combiner;
let resizer;
let lumaBytes;
let chromaBytes;

async function processFrame(bg, overlay) {
  // let start = process.hrtime();
	await Promise.all([
		srcs[0].hostAccess('writeonly', bg[0].slice(0, lumaBytes)),
		srcs[1].hostAccess('writeonly', bg[1].slice(0, chromaBytes)),
		srcs[2].hostAccess('writeonly', bg[2].slice(0, chromaBytes))
	])

  await bgra8Src.hostAccess('writeonly', overlay);

  let timings;
  timings = await yuv422p10Loader.fromYUV({ sources: srcs, dest: rgbaBG });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  timings = await bgra8Loader.fromRGB({ source: bgra8Src, dest: rgbaOV });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  timings = await combiner.run({ bgIn: rgbaBG, ovIn: rgbaOV, output: rgbaDst });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  timings = await resizer.run({ input: rgbaDst, output: rgbaDstWeb });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  timings = await v210Saver.toYUV({ source: rgbaDst, dest: v210Dst });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await v210Dst.hostAccess('readonly');

  timings = await webSaver.toRGB({ source: rgbaDstWeb, dest: webDst });
  // console.log(`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`);

  await webDst.hostAccess('readonly');

  // let end = process.hrtime(start);
  // console.log('OpenCL:', end);
}

let timer = (w) => new Promise((resolve) => {
	setTimeout(resolve, w);
})

async function init () {
  const platformIndex = 0;
  const deviceIndex = 0;
  const context = new addon.clContext({
    platformIndex: platformIndex,
    deviceIndex: deviceIndex
  });
  const platformInfo = await context.getPlatformInfo();
  console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type);

  let demuxer = await beamcoder.demuxer('../../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf');
  await demuxer.seek({ time: 40 });
  let decoder = beamcoder.decoder({ name: 'h264' });
  let encParams = {
    name: 'v210',
    width: width,
    height: height,
    time_base: [1, 25],
    framerate: [25, 1],
    pix_fmt: 'yuv422p10le',
  };
  let encoder = beamcoder.encoder(encParams);

	const bgColSpecRead = '709';
  const ovColSpecRead = 'sRGB';
  const colSpecWrite = '709';
  const webColSpecWrite = 'sRGB';

  yuv422p10Loader = new rgbyuv.yuvLoader(context, bgColSpecRead, colSpecWrite,  new yuv422p10_io.reader(width, height));
  await yuv422p10Loader.init();
  v210Saver = new rgbyuv.yuvSaver(context, colSpecWrite, new v210_io.writer(width, height));
  await v210Saver.init();

  bgra8Loader = new rgbrgb.rgbLoader(context, ovColSpecRead, colSpecWrite, new bgra8_io.reader(width, height));
  await bgra8Loader.init();
  webSaver = new rgbrgb.rgbSaver(context, webColSpecWrite, new rgba8_io.writer(width / 2, height / 2));
  await webSaver.init();

  combiner = new imageProcess(context, width, height, new combine({ numInputs: 2 }));
  await combiner.init();
  resizer = new imageProcess(context, width / 2, height / 2, new resize({}));
  await resizer.init();

	lumaBytes = yuv422p10_io.getPitchBytes(width) * height;
	chromaBytes = lumaBytes / 2;
	const numBytesV210 = v210_io.getPitchBytes(width) * height;

	srcs = [
		await context.createBuffer(lumaBytes, 'readonly', 'coarse'),
		await context.createBuffer(chromaBytes, 'readonly', 'coarse'),
		await context.createBuffer(chromaBytes, 'readonly', 'coarse')
	];
  const numBytesBGRA8 = bgra8_io.getPitchBytes(width) * height;
  bgra8Src = await context.createBuffer(numBytesBGRA8, 'readonly', 'coarse');

  const numBytesRGBA = width * height * 4 * 4;
  rgbaBG = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  rgbaOV = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse', { width: width, height: height });
  rgbaDstWeb = await context.createBuffer(width * height * 4, 'readwrite', 'coarse', { width: width / 2, height: height / 2 });

  v210Dst = await context.createBuffer(numBytesV210, 'writeonly', 'coarse');
  webDst = await context.createBuffer(numBytesBGRA8 / 4, 'writeonly', 'coarse');

  lastWeb = Buffer.alloc(numBytesBGRA8 / 4);

	kapp.use(async ctx => {
		ctx.body = lastWeb;
	})

	let server = kapp.listen(3001);
	process.on('SIGHUP', server.close)

	let result = []
	let counter = 0

	async function read() {
		let packet
		do (packet = await demuxer.read())
		while (packet.stream_index !== 0);
		return packet
	}

	async function waitForIt (t) {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, t > 0 ? t : 0)
		})
	}

	let playback = await macadam.playback({
  	deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
  	displayMode: macadam.bmdModeHD1080i50,
  	pixelFormat: macadam.bmdFormat10BitYUV
	})

	let start = process.hrtime();

	while (true) {
		let work = []
    let stamp = process.hrtime();
		work[0] = read()
		if (result.length >= 1) {
     	work[1] = Promise.all([decoder.decode(result[0]),
				 request('http://localhost:3000/', { encoding: null })]);;
		}
		if (result.length >= 2) {
			// console.log(result[2])
			work[2] = processFrame(result[1][0].frames[0].data, result[1][1])
		}
		if (result.length >= 3) {
      webDst.copy(lastWeb);
			work[3] = playback.displayFrame(v210Dst)
		}
		result = await Promise.all(work)
		let diff = process.hrtime(start)
		let wait = (counter * 40) - ((diff[0] * 1000) + (diff[1] / 1000000 | 0) )
		await waitForIt(wait)
		console.log(`Clunk ${counter++} completed in ${process.hrtime(stamp)} waiting ${wait}`)
	}
};

init();
