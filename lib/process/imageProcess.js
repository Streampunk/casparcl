"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
class ProcessImpl {
    constructor(name, width, height, kernel, programName) {
        this.globalWorkItems = 0;
        this.name = name;
        this.width = width;
        this.height = height;
        this.kernel = kernel;
        this.programName = programName;
    }
    getNumBytesRGBA() {
        return this.width * this.height * 4 * 4;
    }
    getGlobalWorkItems() {
        return Uint32Array.from([this.width, this.height]);
    }
}
exports.ProcessImpl = ProcessImpl;
class ImageProcess {
    constructor(clContext, processImpl) {
        this.program = null;
        this.clContext = clContext;
        this.processImpl = processImpl;
    }
    async init() {
        this.program = await this.clContext.createProgram(this.processImpl.kernel, {
            name: this.processImpl.programName,
            globalWorkItems: this.processImpl.getGlobalWorkItems()
        });
        return this.processImpl.init();
    }
    async run(params, clQueue) {
        if (this.program == null)
            throw new Error('Loader.run failed with no program available');
        const kernelParams = await this.processImpl.getKernelParams(params, clQueue);
        return this.clContext.runProgram(this.program, kernelParams, clQueue);
    }
}
exports.default = ImageProcess;
