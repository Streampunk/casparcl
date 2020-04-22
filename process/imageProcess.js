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

function process(context, outpuWidth, outputHeight, impl) {
	this.context = context
	this.outputWidth = outpuWidth
	this.outputHeight = outputHeight
	this.impl = impl

	return this
}

process.prototype.init = async function () {
	await this.impl.init(this.context)
	this.processProgram = await this.context.createProgram(this.impl.kernel, {
		name: this.impl.getKernelName(),
		globalWorkItems: Uint32Array.from([this.outputWidth, this.outputHeight])
	})
}

process.prototype.run = async function (params, clQueue) {
	let kernelParams = await this.impl.getKernelParams(params, clQueue)
	return this.processProgram.run(kernelParams, clQueue)
}

module.exports = process
