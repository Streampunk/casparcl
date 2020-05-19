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
const macadamConsumer_1 = require("./macadamConsumer");
class InvalidConsumerError extends Error {
    constructor(message) {
        super(message);
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = InvalidConsumerError.name; // stack traces display correctly now
    }
}
exports.InvalidConsumerError = InvalidConsumerError;
class ConsumerRegistry {
    constructor(clContext) {
        this.consumerFactories = [];
        this.consumerFactories.push(new macadamConsumer_1.MacadamConsumerFactory(clContext));
    }
    async createSpout(channel, pipe) {
        let p = null;
        for (const f of this.consumerFactories) {
            try {
                const consumer = f.createConsumer(channel);
                if ((p = await consumer.initialise(pipe)) !== null)
                    break;
            }
            catch (err) {
                if (!(err instanceof InvalidConsumerError)) {
                    throw err;
                }
            }
        }
        if (p === null) {
            console.log(`Failed to find consumer for channel: '${channel}'`);
        }
        return p;
    }
}
exports.ConsumerRegistry = ConsumerRegistry;
