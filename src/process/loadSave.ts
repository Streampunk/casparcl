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

import Packer, { PackImpl } from './packer'
import { clContext as nodenCLContext, OpenCLBuffer, KernelParams, RunTimings } from 'nodencl'
import {
	gamma2linearLUT,
	ycbcr2rgbMatrix,
	matrixFlatten,
	rgb2rgbMatrix,
	linear2gammaLUT,
	rgb2ycbcrMatrix
} from './colourMaths'

export class Loader extends Packer {
	private readonly gammaArray: Float32Array
	private readonly colMatrixArray: Float32Array | null = null
	private readonly gamutMatrixArray: Float32Array
	private gammaLut: OpenCLBuffer | null = null
	private colMatrix: OpenCLBuffer | null = null
	private gamutMatrix: OpenCLBuffer | null = null

	constructor(clContext: nodenCLContext, colSpec: string, outColSpec: string, packImpl: PackImpl) {
		super(clContext, packImpl)

		this.gammaArray = gamma2linearLUT(colSpec)
		if (!this.packImpl.getIsRGB()) {
			const colMatrix2d = ycbcr2rgbMatrix(
				colSpec,
				this.packImpl.numBits,
				this.packImpl.lumaBlack,
				this.packImpl.lumaWhite,
				this.packImpl.chromaRange
			)
			this.colMatrixArray = matrixFlatten(colMatrix2d)
		}

		const gamutMatrix2d = rgb2rgbMatrix(colSpec, outColSpec)
		this.gamutMatrixArray = matrixFlatten(gamutMatrix2d)
	}

	async init(): Promise<void> {
		await super.init()

		this.gammaLut = await this.clContext.createBuffer(
			this.gammaArray.byteLength,
			'readonly',
			'coarse'
		)
		await this.gammaLut.hostAccess('writeonly')
		Buffer.from(this.gammaArray.buffer).copy(this.gammaLut)

		if (this.colMatrixArray) {
			this.colMatrix = await this.clContext.createBuffer(
				this.colMatrixArray.byteLength,
				'readonly',
				'none'
			)
			await this.colMatrix.hostAccess('writeonly')
			Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix)
		}

		this.gamutMatrix = await this.clContext.createBuffer(
			this.gamutMatrixArray.byteLength,
			'readonly',
			'none'
		)
		await this.gamutMatrix.hostAccess('writeonly')
		Buffer.from(this.gamutMatrixArray.buffer).copy(this.gamutMatrix)
	}

	async run(params: KernelParams, queueNum: number): Promise<RunTimings> {
		if (this.program === null) throw new Error('Loader.run failed with no program available')

		const kernelParams = this.packImpl.getKernelParams(params)
		kernelParams.gammaLut = this.gammaLut
		kernelParams.gamutMatrix = this.gamutMatrix
		if (this.colMatrix) kernelParams.colMatrix = this.colMatrix

		return this.clContext.runProgram(this.program, kernelParams, queueNum)
	}
}

export class Saver extends Packer {
	private readonly gammaArray: Float32Array
	private readonly colMatrixArray: Float32Array | null = null
	private gammaLut: OpenCLBuffer | null = null
	private colMatrix: OpenCLBuffer | null = null

	constructor(clContext: nodenCLContext, colSpec: string, packImpl: PackImpl) {
		super(clContext, packImpl)

		this.gammaArray = linear2gammaLUT(colSpec)
		if (!this.packImpl.getIsRGB()) {
			const colMatrix2d = rgb2ycbcrMatrix(
				colSpec,
				this.packImpl.numBits,
				this.packImpl.lumaBlack,
				this.packImpl.lumaWhite,
				this.packImpl.chromaRange
			)
			this.colMatrixArray = matrixFlatten(colMatrix2d)
		}
	}

	async init(): Promise<void> {
		await super.init()

		this.gammaLut = await this.clContext.createBuffer(
			this.gammaArray.byteLength,
			'readonly',
			'coarse'
		)
		await this.gammaLut.hostAccess('writeonly')

		Buffer.from(this.gammaArray.buffer).copy(this.gammaLut)
		if (this.colMatrixArray) {
			this.colMatrix = await this.clContext.createBuffer(
				this.colMatrixArray.byteLength,
				'readonly',
				'none'
			)
			await this.colMatrix.hostAccess('writeonly')
			Buffer.from(this.colMatrixArray.buffer).copy(this.colMatrix)
		}
	}

	async run(params: KernelParams, queueNum: number): Promise<RunTimings> {
		if (this.program === null) throw new Error('Saver.run failed with no program available')

		const kernelParams = this.packImpl.getKernelParams(params)
		kernelParams.gammaLut = this.gammaLut
		if (this.colMatrix) kernelParams.colMatrix = this.colMatrix

		return this.clContext.runProgram(this.program, kernelParams, queueNum)
	}
}
