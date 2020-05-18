"use strict";
/* Copyright 2020 Streampunk Media Ltd.

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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const redioactive_1 = require("redioactive");
const Macadam = __importStar(require("macadam"));
const io_1 = require("../process/io");
const v210_1 = require("../process/v210");
class MacadamConsumer {
    constructor(channel, context) {
        this.playback = null;
        this.channel = channel;
        this.clContext = context;
        this.field = 0;
        this.frameNumber = 0;
        this.latency = 3;
    }
    async initialise(pipe) {
        this.playback = await Macadam.playback({
            deviceIndex: this.channel - 1,
            displayMode: Macadam.bmdModeHD1080i50,
            pixelFormat: Macadam.bmdFormat10BitYUV
        });
        this.fromRGBA = new io_1.FromRGBA(this.clContext, '709', new v210_1.Writer(this.playback.width, this.playback.height, this.playback.fieldDominance != 'progressiveFrame'));
        await this.fromRGBA.init();
        this.vidProcess = pipe.valve(async (frame) => {
            if (!redioactive_1.isEnd(frame) && !redioactive_1.isNil(frame)) {
                const fromRGBA = this.fromRGBA;
                if (this.field === 0)
                    this.clDests = await fromRGBA.createDests();
                const clDests = this.clDests;
                const srcFrame = frame;
                const queue = this.clContext.queue.process;
                const interlace = 0x1 | (this.field << 1);
                await fromRGBA.processFrame(srcFrame.video, clDests, queue, interlace);
                await this.clContext.waitFinish(queue);
                srcFrame.video.release();
                this.field = 1 - this.field;
                return this.field === 1 ? redioactive_1.nil : clDests[0];
            }
            else {
                return frame;
            }
        }, { bufferSizeMax: 3, oneToMany: false });
        this.vidSaver = this.vidProcess.valve(async (frame) => {
            if (!redioactive_1.isEnd(frame) && !redioactive_1.isNil(frame)) {
                const v210Frame = frame;
                const fromRGBA = this.fromRGBA;
                await fromRGBA.saveFrame(v210Frame, this.clContext.queue.unload);
                await this.clContext.waitFinish(this.clContext.queue.unload);
                return v210Frame;
            }
            else {
                return frame;
            }
        }, { bufferSizeMax: 3, oneToMany: false });
        this.spout = this.vidSaver.spout(async (frame) => {
            var _a, _b, _c;
            if (!redioactive_1.isEnd(frame) && !redioactive_1.isNil(frame)) {
                const v210Frame = frame;
                (_a = this.playback) === null || _a === void 0 ? void 0 : _a.schedule({ video: v210Frame, time: 1000 * this.frameNumber });
                if (this.frameNumber === this.latency)
                    (_b = this.playback) === null || _b === void 0 ? void 0 : _b.start({ startTime: 0 });
                if (this.frameNumber >= this.latency)
                    await ((_c = this.playback) === null || _c === void 0 ? void 0 : _c.played((this.frameNumber - this.latency) * 1000));
                this.frameNumber++;
                v210Frame.release();
                return Promise.resolve();
            }
            else {
                return Promise.resolve();
            }
        }, { bufferSizeMax: 3, oneToMany: false });
        console.log(`Created Macadam consumer for Blackmagic id: ${this.channel - 1}`);
        return this.spout;
    }
}
exports.MacadamConsumer = MacadamConsumer;
class MacadamConsumerFactory {
    constructor(clContext) {
        this.clContext = clContext;
    }
    createConsumer(channel) {
        return new MacadamConsumer(channel, this.clContext);
    }
}
exports.MacadamConsumerFactory = MacadamConsumerFactory;
