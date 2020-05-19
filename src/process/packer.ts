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

import { clContext as nodenCLContext, OpenCLProgram, KernelParams, RunTimings } from 'nodencl'

export enum Interlace {
	Progressive = 0,
	TopField = 1,
	BottomField = 3
}

export abstract class PackImpl {
	protected readonly name: string
	protected readonly width: number
	protected readonly height: number
	protected interlaced = false
	readonly kernel: string
	readonly programName: string
	numBits = 10
	lumaBlack = 64
	lumaWhite = 940
	chromaRange = 896
	protected isRGB = true
	protected numBytes: Array<number> = [0]
	protected globalWorkItems = 0
	protected workItemsPerGroup = 0

	constructor(name: string, width: number, height: number, kernel: string, programName: string) {
		this.name = name
		this.width = width
		this.height = height
		this.kernel = kernel
		this.programName = programName
	}

	getWidth(): number {
		return this.width
	}
	getHeight(): number {
		return this.height
	}
	getNumBytes(): Array<number> {
		return this.numBytes
	}
	getNumBytesRGBA(): number {
		return this.width * this.height * 4 * 4
	}
	getIsRGB(): boolean {
		return this.isRGB
	}
	getTotalBytes(): number {
		return this.numBytes.reduce((acc, n) => acc + n, 0)
	}
	getGlobalWorkItems(): number {
		return this.globalWorkItems
	}
	getWorkItemsPerGroup(): number {
		return this.workItemsPerGroup
	}

	abstract getKernelParams(params: KernelParams): KernelParams
}

export default abstract class Packer {
	protected readonly clContext: nodenCLContext
	protected readonly packImpl: PackImpl
	protected program: OpenCLProgram | null = null

	constructor(clContext: nodenCLContext, packImpl: PackImpl) {
		this.clContext = clContext
		this.packImpl = packImpl
	}

	async init(): Promise<void> {
		this.program = await this.clContext.createProgram(this.packImpl.kernel, {
			name: this.packImpl.programName,
			globalWorkItems: this.packImpl.getGlobalWorkItems(),
			workItemsPerGroup: this.packImpl.getWorkItemsPerGroup()
		})
	}

	abstract async run(kernelParams: KernelParams, queueNum: number): Promise<RunTimings>
}
