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
var Interlace;
(function (Interlace) {
    Interlace[Interlace["Progressive"] = 0] = "Progressive";
    Interlace[Interlace["TopField"] = 1] = "TopField";
    Interlace[Interlace["BottomField"] = 3] = "BottomField";
})(Interlace = exports.Interlace || (exports.Interlace = {}));
class PackImpl {
    constructor(name, width, height, kernel, programName) {
        this.interlaced = false;
        this.numBits = 10;
        this.lumaBlack = 64;
        this.lumaWhite = 940;
        this.chromaRange = 896;
        this.isRGB = true;
        this.numBytes = [0];
        this.globalWorkItems = 0;
        this.workItemsPerGroup = 0;
        this.name = name;
        this.width = width;
        this.height = height;
        this.kernel = kernel;
        this.programName = programName;
    }
    getWidth() {
        return this.width;
    }
    getHeight() {
        return this.height;
    }
    getNumBytes() {
        return this.numBytes;
    }
    getNumBytesRGBA() {
        return this.width * this.height * 4 * 4;
    }
    getIsRGB() {
        return this.isRGB;
    }
    getTotalBytes() {
        return this.numBytes.reduce((acc, n) => acc + n, 0);
    }
    getGlobalWorkItems() {
        return this.globalWorkItems;
    }
    getWorkItemsPerGroup() {
        return this.workItemsPerGroup;
    }
}
exports.PackImpl = PackImpl;
class Packer {
    constructor(clContext, packImpl) {
        this.program = null;
        this.clContext = clContext;
        this.packImpl = packImpl;
    }
    async init() {
        this.program = await this.clContext.createProgram(this.packImpl.kernel, {
            name: this.packImpl.programName,
            globalWorkItems: this.packImpl.getGlobalWorkItems(),
            workItemsPerGroup: this.packImpl.getWorkItemsPerGroup()
        });
    }
}
exports.default = Packer;
