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
const yuv422p10_io = require('../lib/process/yuv422p10.js')

function dumpFloatBuf(buf, width, height, numPixels, numLines) {
	const r = (b, o) => b.readFloatLE(o).toFixed(4)
	for (let y = 0; y < numLines; ++y) {
		const off = y * width * 4 * 4
		let s = `Line ${y}: ${r(buf, off)}`
		for (let i = 1; i < numPixels * 4; ++i) s += `, ${r(buf, off + i * 4)}`
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
	const colSpecWrite = '709'
	const width = 1920
	const height = 1080

	const yuv422p10Loader = new io.ToRGBA(
		context,
		colSpecRead,
		colSpecWrite,
		new yuv422p10_io.Reader(width, height)
	)
	await yuv422p10Loader.init()

	const yuv422p10Saver = new io.FromRGBA(
		context,
		colSpecWrite,
		new yuv422p10_io.Writer(width, height, false)
	)
	await yuv422p10Saver.init()

	const srcs = await yuv422p10Loader.createSources()
	const rgbaDst = await yuv422p10Loader.createDest({ width: width, height: height })

	const dsts = await yuv422p10Saver.createDests()

	const numBytes = yuv422p10Loader.getNumBytes()
	const lumaBytes = numBytes[0]
	const chromaBytes = numBytes[1]
	const numBytesyuv422p10 = yuv422p10Loader.getTotalBytes()
	const yuv422p10Src = Buffer.allocUnsafe(numBytesyuv422p10)
	yuv422p10_io.fillBuf(yuv422p10Src, width, height)
	yuv422p10_io.dumpBuf(yuv422p10Src, width, height, 4)

	await srcs[0].hostAccess('writeonly', 0, yuv422p10Src.slice(0, lumaBytes))
	await srcs[1].hostAccess('writeonly', 0, yuv422p10Src.slice(lumaBytes, lumaBytes + chromaBytes))
	await srcs[2].hostAccess(
		'writeonly',
		0,
		yuv422p10Src.slice(lumaBytes + chromaBytes, lumaBytes + chromaBytes * 2)
	)

	let timings = await yuv422p10Loader.processFrame(srcs, rgbaDst)
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await rgbaDst.hostAccess('readonly')
	dumpFloatBuf(rgbaDst, width, height, 2, 4)

	timings = await yuv422p10Saver.processFrame(rgbaDst, dsts)
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await dsts[0].hostAccess('readonly')
	await dsts[1].hostAccess('readonly')
	await dsts[2].hostAccess('readonly')
	const yuv422p10Dst = Buffer.concat(dsts, numBytesyuv422p10)
	yuv422p10_io.dumpBuf(yuv422p10Dst, width, height, 4)

	await srcs[0].hostAccess('readonly')
	await srcs[1].hostAccess('readonly')
	await srcs[2].hostAccess('readonly')
	console.log('Compare returned', yuv422p10Src.compare(yuv422p10Dst))

	return [srcs[0], dsts[0]]
}
noden()
	.then(([i, o]) => [i.creationTime, o.creationTime])
	.then(([ict, oct]) => {
		if (global.gc) global.gc()
		console.log(ict, oct)
	})
	.catch(console.error)
