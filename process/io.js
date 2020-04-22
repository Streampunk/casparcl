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

const rgbrgb = require('./rgbrgbPacker.js')
const rgbyuv = require('./rgbyuvPacker.js')
const rgba8_io = require('./rgba8_io.js')
const bgra8_io = require('./bgra8_io.js')
const v210_io = require('./v210_io.js')
const yuv422p8_io = require('./yuv422p8_io.js')
const yuv422p10_io = require('./yuv422p10_io.js')
const imageProcess = require('../process/imageProcess.js')
const resize = require('../process/resize.js')

function toRGBA(context, width, height, format) {
	this.context = context
	this.width = width
	this.height = height
	this.format = format
	this.numBytes = [0]

	this.getNumBytes = () => (1 === this.numBytes.length ? this.numBytes[0] : this.numBytes)
	return this
}

toRGBA.prototype.init = async function (params) {
	switch (this.format) {
		case 'yuv422p8':
		case 'yuv422p10': {
			const impl = 'yuv422p8' == this.format ? yuv422p8_io : yuv422p10_io
			this.loader = new rgbyuv.yuvLoader(
				this.context,
				params.colSpecRead,
				params.colSpecWrite,
				new impl.reader(this.width, this.height)
			)
			const lumaBytes = impl.getPitchBytes(this.width) * this.height
			this.numBytes = [lumaBytes, lumaBytes / 2, lumaBytes / 2]
			break
		}
		case 'v210':
			this.loader = new rgbyuv.yuvLoader(
				this.context,
				params.colSpecRead,
				params.colSpecWrite,
				new v210_io.reader(this.width, this.height)
			)
			this.numBytes = [v210_io.getPitchBytes(this.width) * this.height]
			break
		case 'rgba8':
			this.loader = new rgbrgb.rgbLoader(
				this.context,
				params.colSpecRead,
				params.colSpecWrite,
				new rgba8_io.reader(this.width, this.height)
			)
			this.numBytes = [rgba8_io.getPitchBytes(this.width) * this.height]
			break
		case 'bgra8':
			this.loader = new rgbrgb.rgbLoader(
				this.context,
				params.colSpecRead,
				params.colSpecWrite,
				new bgra8_io.reader(this.width, this.height)
			)
			this.numBytes = [bgra8_io.getPitchBytes(this.width) * this.height]
			break
		default:
			throw `unrecognised input format '${this.format}'`
	}
	await this.loader.init()
}

toRGBA.prototype.createBuffers = async function () {
	let buffers
	switch (this.format) {
		case 'yuv422p8':
		case 'yuv422p10':
			buffers = [
				await this.context.createBuffer(this.numBytes[0], 'readonly', 'coarse'),
				await this.context.createBuffer(this.numBytes[1], 'readonly', 'coarse'),
				await this.context.createBuffer(this.numBytes[2], 'readonly', 'coarse')
			]
			break
		case 'v210':
		case 'rgba8':
		case 'bgra8':
			buffers = [await this.context.createBuffer(this.numBytes[0], 'readonly', 'coarse')]
			break
		default:
			throw `unrecognised input format '${this.format}'`
	}
	return buffers
}

toRGBA.prototype.loadFrame = async function (input, sources, clQueue) {
	const inputs = Array.isArray(input) ? input : [input]
	return Promise.all(
		sources.map(async (src, i) => {
			await src.hostAccess('writeonly', clQueue, inputs[i].slice(0, this.numBytes[i]))
			return src.hostAccess('none', clQueue)
		})
	)
}

toRGBA.prototype.processFrame = async function (sources, output, clQueue) {
	let result
	switch (this.format) {
		case 'yuv422p8':
		case 'yuv422p10':
			result = this.loader.fromYUV({ sources: sources, dest: output }, clQueue)
			break
		case 'v210':
			result = this.loader.fromYUV({ source: sources[0], dest: output }, clQueue)
			break
		default:
			result = this.loader.fromRGB({ source: sources[0], dest: output }, clQueue)
	}
	return result
}

function fromRGBA(context, width, height, format) {
	this.context = context
	this.width = width
	this.height = height
	this.format = format
	this.numBytes = [0]

	this.getNumBytes = () => (1 === this.numBytes.length ? this.numBytes[0] : this.numBytes)
	return this
}

fromRGBA.prototype.init = async function (params) {
	switch (this.format) {
		case 'yuv422p8':
		case 'yuv422p10': {
			const impl = 'yuv422p8' == this.format ? yuv422p8_io : yuv422p10_io
			this.saver = new rgbyuv.yuvSaver(
				this.context,
				params.colSpec,
				new impl.writer(this.width, this.height)
			)
			const lumaBytes = impl.getPitchBytes(this.width) * this.height
			this.numBytes = [lumaBytes, lumaBytes / 2, lumaBytes / 2]
			break
		}
		case 'v210':
			this.saver = new rgbyuv.yuvSaver(
				this.context,
				params.colSpec,
				new v210_io.writer(this.width, this.height)
			)
			this.numBytes = [v210_io.getPitchBytes(this.width) * this.height]
			break
		case 'rgba8':
			this.saver = new rgbrgb.rgbSaver(
				this.context,
				params.colSpec,
				new rgba8_io.writer(this.width, this.height)
			)
			this.numBytes = [rgba8_io.getPitchBytes(this.width) * this.height]
			break
		case 'bgra8':
			this.saver = new rgbrgb.rgbSaver(
				this.context,
				params.colSpec,
				new bgra8_io.writer(this.width, this.height)
			)
			this.numBytes = [bgra8_io.getPitchBytes(this.width) * this.height]
			break
		default:
			throw `unrecognised output format '${this.format}'`
	}
	await this.saver.init()

	const srcWidth = params.srcWidth ? params.srcWidth : this.width
	const srcHeight = params.srcHeight ? params.srcHeight : this.height

	if (!(srcWidth === this.width && srcHeight === this.height)) {
		this.resizer = new imageProcess(this.context, this.width, this.height, new resize({}))
		await this.resizer.init()
		this.rgbaSz = []
		for (let f = 0; f < 2; ++f)
			this.rgbaSz.push(
				await this.context.createBuffer(this.width * this.height * 4 * 4, 'readwrite', 'coarse', {
					width: this.width,
					height: this.height
				})
			)
	}
}

fromRGBA.prototype.processFrame = async function (input, numFields, output, clQueue) {
	const outputs = Array.isArray(output) ? output : [output]
	let result

	let source = input
	if (this.resizer) {
		for (let f = 0; f < numFields; ++f)
			await this.resizer.run({ input: input[f], output: this.rgbaSz[f] }, clQueue)
		source = this.rgbaSz
	}

	const interlace = output.interlaced && numFields > 1 ? (output.tff ? 0x1 : 0x3) : 0
	switch (this.format) {
		case 'yuv422p10':
			result = this.saver.toYUV({ source: source, dest: outputs, interlace: interlace }, clQueue)
			break
		case 'v210':
			result = this.saver.toYUV({ source: source, dest: outputs[0], interlace: interlace }, clQueue)
			break
		default:
			result = this.saver.toRGB({ source: source, dest: outputs[0], interlace: interlace }, clQueue)
	}
	return result
}

fromRGBA.prototype.saveFrame = async function (output, clQueue) {
	const outputs = Array.isArray(output) ? output : [output]
	return Promise.all(outputs.map((op) => op.hostAccess('readonly', clQueue)))
}

module.exports = {
	toRGBA,
	fromRGBA
}
