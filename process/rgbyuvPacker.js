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

const colMaths = require('./colourMaths.js')

function yuvLoader(context, colSpec, outColSpec, impl) {
	this.context = context
	this.impl = impl

	const colMatrix2d = colMaths.ycbcr2rgbMatrix(
		colSpec,
		this.impl.numBits,
		this.impl.lumaBlack,
		this.impl.lumaWhite,
		this.impl.chromaRange
	)
	this.colMatrixArray = colMaths.matrixFlatten(colMatrix2d)

	this.gammaArray = colMaths.gamma2linearLUT(colSpec)

	const gamutMatrix2d = colMaths.rgb2rgbMatrix(colSpec, outColSpec)
	this.gamutMatrixArray = colMaths.matrixFlatten(gamutMatrix2d)

	return this
}

yuvLoader.prototype.init = async function () {
	this.colMatrix = await this.context.createBuffer(
		this.colMatrixArray.byteLength,
		'readonly',
		'none'
	)
	await this.colMatrix.hostAccess('writeonly')
	Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix)

	this.gammaLut = await this.context.createBuffer(this.gammaArray.byteLength, 'readonly', 'coarse')
	await this.gammaLut.hostAccess('writeonly')
	Buffer.from(this.gammaArray.buffer).copy(this.gammaLut)

	this.gamutMatrix = await this.context.createBuffer(
		this.gamutMatrixArray.byteLength,
		'readonly',
		'none'
	)
	await this.gamutMatrix.hostAccess('writeonly')
	Buffer.from(this.gamutMatrixArray.buffer).copy(this.gamutMatrix)

	this.readProgram = await this.context.createProgram(this.impl.kernel, {
		name: 'read',
		globalWorkItems: this.impl.getGlobalWorkItems(),
		workItemsPerGroup: this.impl.getWorkItemsPerGroup()
	})
}

yuvLoader.prototype.fromYUV = async function (params, queueNum) {
	let kernelParams = this.impl.getKernelParams(params)
	kernelParams.colMatrix = this.colMatrix
	kernelParams.gammaLut = this.gammaLut
	kernelParams.gamutMatrix = this.gamutMatrix
	return this.readProgram.run(kernelParams, queueNum)
}

function yuvSaver(context, colSpec, impl) {
	this.context = context
	this.impl = impl

	const colMatrix2d = colMaths.rgb2ycbcrMatrix(
		colSpec,
		this.impl.numBits,
		this.impl.lumaBlack,
		this.impl.lumaWhite,
		this.impl.chromaRange
	)
	this.colMatrixArray = colMaths.matrixFlatten(colMatrix2d)

	this.gammaArray = colMaths.linear2gammaLUT(colSpec)
	return this
}

yuvSaver.prototype.init = async function () {
	this.colMatrix = await this.context.createBuffer(
		this.colMatrixArray.byteLength,
		'readonly',
		'none'
	)
	await this.colMatrix.hostAccess('writeonly')
	Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix)

	this.gammaLut = await this.context.createBuffer(this.gammaArray.byteLength, 'readonly', 'coarse')
	await this.gammaLut.hostAccess('writeonly')
	Buffer.from(this.gammaArray.buffer).copy(this.gammaLut)

	this.writeProgram = await this.context.createProgram(this.impl.kernel, {
		name: 'write',
		globalWorkItems: this.impl.getGlobalWorkItems(),
		workItemsPerGroup: this.impl.getWorkItemsPerGroup()
	})
}

yuvSaver.prototype.toYUV = async function (params, queueNum) {
	let kernelParams = this.impl.getKernelParams(params)
	kernelParams.colMatrix = this.colMatrix
	kernelParams.gammaLut = this.gammaLut
	return this.writeProgram.run(kernelParams, queueNum)
}

module.exports = {
	yuvLoader,
	yuvSaver
}
