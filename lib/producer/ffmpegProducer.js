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
const producer_1 = require("./producer");
const beamcoder_1 = require("beamcoder");
const redioactive_1 = __importStar(require("redioactive"));
const io_1 = require("../process/io");
const yuv422p10_1 = require("../process/yuv422p10");
class FFmpegProducer {
    constructor(id, params, context) {
        this.id = id;
        this.params = params;
        this.clContext = context;
        this.decoders = [];
        this.filterers = [];
        this.clContext.logBuffers();
    }
    async initialise() {
        const url = this.params[0];
        let width = 0;
        let height = 0;
        try {
            this.demuxer = await beamcoder_1.demuxer(url);
            // console.log('NumStreams:', this.demuxer.streams.length)
            this.demuxer.streams.forEach((_s, i) => {
                // eslint-disable-next-line @typescript-eslint/camelcase
                this.decoders.push(beamcoder_1.decoder({ demuxer: this.demuxer, stream_index: i }));
            });
            const vidStream = this.demuxer.streams[0];
            width = vidStream.codecpar.width;
            height = vidStream.codecpar.height;
            this.filterers[0] = await beamcoder_1.filterer({
                filterType: 'video',
                inputParams: [
                    {
                        width: width,
                        height: height,
                        pixelFormat: vidStream.codecpar.format,
                        timeBase: vidStream.time_base,
                        pixelAspect: vidStream.codecpar.sample_aspect_ratio
                    }
                ],
                outputParams: [
                    {
                        pixelFormat: vidStream.codecpar.format
                    }
                ],
                filterSpec: 'yadif=mode=send_field:parity=auto:deint=all'
            });
            this.toRGBA = new io_1.ToRGBA(this.clContext, '709', '709', new yuv422p10_1.Reader(vidStream.codecpar.width, vidStream.codecpar.height));
            await this.toRGBA.init();
        }
        catch (err) {
            throw new producer_1.InvalidProducerError(err);
        }
        this.vidSource = redioactive_1.default(async (push, next) => {
            var _a;
            const packet = await ((_a = this.demuxer) === null || _a === void 0 ? void 0 : _a.read());
            // console.log('PKT:', packet?.stream_index, packet?.pts)
            if (packet && (packet === null || packet === void 0 ? void 0 : packet.stream_index) === 0)
                push(packet);
            next();
        }, { bufferSizeMax: 3 });
        this.vidDecode = this.vidSource.valve(async (packet) => {
            if (!redioactive_1.isEnd(packet) && !redioactive_1.isNil(packet)) {
                const pkt = packet;
                const frm = await this.decoders[pkt.stream_index].decode(pkt);
                return frm.frames;
            }
            else {
                return packet;
            }
        }, { bufferSizeMax: 3, oneToMany: true });
        this.vidFilter = this.vidDecode.valve(async (frame) => {
            if (!redioactive_1.isEnd(frame) && !redioactive_1.isNil(frame)) {
                const frm = frame;
                const ff = await this.filterers[0].filter([frm]);
                return ff[0].frames;
            }
            else {
                return frame;
            }
        }, { bufferSizeMax: 3, oneToMany: true });
        this.vidLoader = this.vidFilter.valve(async (frame) => {
            if (!redioactive_1.isEnd(frame) && !redioactive_1.isNil(frame)) {
                const frm = frame;
                const toRGBA = this.toRGBA;
                const clSources = await toRGBA.createSources();
                await toRGBA.loadFrame(frm.data, clSources, this.clContext.queue.load);
                await this.clContext.waitFinish(this.clContext.queue.load);
                return clSources;
            }
            else {
                return frame;
            }
        }, { bufferSizeMax: 3, oneToMany: false });
        this.vidProcess = this.vidLoader.valve(async (clSources) => {
            if (!redioactive_1.isEnd(clSources) && !redioactive_1.isNil(clSources)) {
                const clSrcs = clSources;
                const toRGBA = this.toRGBA;
                const clDest = await toRGBA.createDest({ width: width, height: height });
                await toRGBA.processFrame(clSrcs, clDest, this.clContext.queue.process);
                await this.clContext.waitFinish(this.clContext.queue.process);
                clSrcs.forEach((s) => s.release());
                const sourceFrame = { video: clDest, audio: Buffer.alloc(0), timestamp: 0 };
                return sourceFrame;
            }
            else {
                return clSources;
            }
        }, { bufferSizeMax: 3, oneToMany: false });
        console.log(`Created FFmpeg producer ${this.id} for path ${url}`);
        return this.vidProcess;
    }
}
exports.FFmpegProducer = FFmpegProducer;
class FFmpegProducerFactory {
    constructor(clContext) {
        this.clContext = clContext;
    }
    createProducer(id, params) {
        return new FFmpegProducer(id, params, this.clContext);
    }
}
exports.FFmpegProducerFactory = FFmpegProducerFactory;
