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
const rgbrgb = require('../process/rgbrgbPacker.js')
const rgba8_io = require('../process/rgba8_io.js')
const bgra8_io = require('../process/bgra8_io.js')

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
	const platformInfo = context.getPlatformInfo()
	// console.log(JSON.stringify(platformInfo, null, 2));
	console.log(platformInfo.vendor, platformInfo.devices[deviceIndex].type)

	const colSpecRead = 'sRGB'
	const colSpecWrite = '709'
	const width = 1920
	const height = 1080

	const rgba8Loader = new rgbrgb.rgbLoader(
		context,
		colSpecRead,
		colSpecWrite,
		new rgba8_io.reader(width, height)
	)
	await rgba8Loader.init()

	const bgra8Saver = new rgbrgb.rgbSaver(context, colSpecWrite, new bgra8_io.writer(width, height))
	await bgra8Saver.init()

	const numBytesRGBA8 = rgba8_io.getPitchBytes(width) * height
	const rgba8Src = await context.createBuffer(numBytesRGBA8, 'readonly', 'coarse')
	await rgba8Src.hostAccess('writeonly')
	rgba8_io.fillBuf(rgba8Src, width, height)
	rgba8_io.dumpBuf(rgba8Src, width, 4)

	const numBytesRGBA = width * height * 4 * 4
	const rgbaDst = await context.createBuffer(numBytesRGBA, 'readwrite', 'coarse')

	const numBytesBGRA8 = bgra8_io.getPitchBytes(width) * height
	const bgra8Dst = await context.createBuffer(numBytesBGRA8, 'writeonly', 'coarse')

	let timings = await rgba8Loader.fromRGB({ source: rgba8Src, dest: rgbaDst })
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await rgbaDst.hostAccess('readonly')
	dumpFloatBuf(rgbaDst, width, height, 2, 8)

	timings = await bgra8Saver.toRGB({ source: rgbaDst, dest: bgra8Dst })
	console.log(
		`${timings.dataToKernel}, ${timings.kernelExec}, ${timings.dataFromKernel}, ${timings.totalTime}`
	)

	await bgra8Dst.hostAccess('readonly')
	bgra8_io.dumpBuf(bgra8Dst, width, 8)

	return [rgba8Src, bgra8Dst]
}
noden()
	.then(([i, o]) => [i.creationTime, o.creationTime])
	.then(([ict, oct]) => {
		if (global.gc) global.gc()
		console.log(ict, oct)
	})
	.catch(console.error)
