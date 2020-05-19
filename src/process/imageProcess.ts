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

export abstract class ProcessImpl {
	protected readonly name: string
	protected readonly width: number
	protected readonly height: number
	readonly kernel: string
	readonly programName: string
	readonly globalWorkItems = 0

	constructor(name: string, width: number, height: number, kernel: string, programName: string) {
		this.name = name
		this.width = width
		this.height = height
		this.kernel = kernel
		this.programName = programName
	}

	abstract async init(): Promise<void>

	getNumBytesRGBA(): number {
		return this.width * this.height * 4 * 4
	}
	getGlobalWorkItems(): Uint32Array {
		return Uint32Array.from([this.width, this.height])
	}

	abstract async getKernelParams(params: KernelParams, clQueue: number): Promise<KernelParams>
}

export default class ImageProcess {
	private readonly clContext: nodenCLContext
	private readonly processImpl: ProcessImpl
	private program: OpenCLProgram | null = null
	constructor(clContext: nodenCLContext, processImpl: ProcessImpl) {
		this.clContext = clContext
		this.processImpl = processImpl
	}

	async init(): Promise<void> {
		this.program = await this.clContext.createProgram(this.processImpl.kernel, {
			name: this.processImpl.programName,
			globalWorkItems: this.processImpl.getGlobalWorkItems()
		})
		return this.processImpl.init()
	}

	async run(params: KernelParams, clQueue: number): Promise<RunTimings> {
		if (this.program == null) throw new Error('Loader.run failed with no program available')
		const kernelParams = await this.processImpl.getKernelParams(params, clQueue)
		return this.clContext.runProgram(this.program, kernelParams, clQueue)
	}
}
