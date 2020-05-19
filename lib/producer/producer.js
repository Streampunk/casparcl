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
Object.defineProperty(exports, "__esModule", { value: true });
const ffmpegProducer_1 = require("./ffmpegProducer");
class InvalidProducerError extends Error {
    constructor(message) {
        super(message);
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = InvalidProducerError.name; // stack traces display correctly now
    }
}
exports.InvalidProducerError = InvalidProducerError;
class ProducerRegistry {
    constructor(clContext) {
        this.producerFactories = [];
        this.producerFactories.push(new ffmpegProducer_1.FFmpegProducerFactory(clContext));
    }
    async createSource(chanLay, params) {
        const id = `${chanLay.channel}-${chanLay.layer}`;
        let p = null;
        for (const f of this.producerFactories) {
            try {
                const producer = f.createProducer(id, params);
                if ((p = await producer.initialise()) !== null)
                    break;
            }
            catch (err) {
                if (!(err instanceof InvalidProducerError)) {
                    throw err;
                }
            }
        }
        if (p === null) {
            console.log(`Failed to find producer for params: '${params}'`);
        }
        return p;
    }
}
exports.ProducerRegistry = ProducerRegistry;
