/* Copyright 2018 Streampunk Media Ltd.

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
const io = require('../lib/process/io.js')
const v210_io = require('../lib/process/v210.js')

const testImage = `
__constant sampler_t sampler =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

__kernel void
  testImage(__read_only image2d_t input,
            __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in = read_imagef(input, sampler, (int2)(x,y));
    write_imagef(output, (int2)(x,y), in);
  }
`

function dumpFloatBuf(buf, width, numPixels, numLines) {
	let lineOff = 0
	const r = (o) => buf.readFloatLE(lineOff + o).toFixed(4)
	for (let y = 0; y < numLines; ++y) {
		lineOff = y * width * 4 * 4
		let s = `Line ${y}: ${r(0)}`
		for (let i = 1; i < numPixels * 4; ++i) s += `, ${r(i * 4)}`
		s += ` ... ${r(128)}`
		for (let i = 1; i < numPixels * 4; ++i) s += `, ${r(128 + i * 4)}`
		console.log(s)
	}
}

async function noden() {
	const platformIndex = 1
	const deviceIndex = 0
	const context = new addon.clContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex
	})
	await context.initialise()
	const platformInfo = context.getPlatformInfo()
	// console.log(JSON.stringify(platformInfo, null, 2));
	console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type)

	const colSpecRead = '709'
	const colSpecWrite = '2020'
	const width = 1920
	const height = 1080

	const v210Loader = new io.ToRGBA(
		context,
		colSpecRead,
		colSpecWrite,
		new v210_io.Reader(width, height)
	)
	await v210Loader.init()

	const v210Saver = new io.FromRGBA(context, colSpecWrite, new v210_io.Writer(width, height, false))
	await v210Saver.init()

	// const globalWorkItems = Uint32Array.from([ width, height ]);
	const testImageProgram = await context.createProgram(testImage, {
		globalWorkItems: Uint32Array.from([width, height])
	})

	const v210Srcs = await v210Loader.createSources()
	const rgbaDst = await v210Loader.createDest({ width: width, height: height })

	const imageDst = await context.createBuffer(v210Loader.getNumBytesRGBA(), 'readwrite', 'coarse', {
		width: width,
		height: height
	})

	const v210Dsts = await v210Saver.createDests()

	const v210Src = v210Srcs[0]
	await v210Src.hostAccess('writeonly')
	v210_io.fillBuf(v210Src, width, height)
	v210_io.dumpBuf(v210Src, width, 4)

	let timings = await v210Loader.processFrame(v210Srcs, rgbaDst)
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await rgbaDst.hostAccess('readonly')
	dumpFloatBuf(rgbaDst, width, 2, 4)

	timings = await testImageProgram.run({ input: rgbaDst, output: imageDst })
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await imageDst.hostAccess('readonly')
	dumpFloatBuf(imageDst, width, 2, 4)

	timings = await v210Saver.processFrame(imageDst, v210Dsts)
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	const v210Dst = v210Dsts[0]
	await v210Dst.hostAccess('readonly')
	v210_io.dumpBuf(v210Dst, width, 4)

	await v210Src.hostAccess('readonly')
	console.log('Compare returned', v210Src.compare(v210Dst))

	return [v210Src, v210Dst]
}
noden()
	.then(([i, o]) => [i.creationTime, o.creationTime])
	.then(([ict, oct]) => {
		if (global.gc) global.gc()
		console.log(ict, oct)
	})
	.catch(console.error)
