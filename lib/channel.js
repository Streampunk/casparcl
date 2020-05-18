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
const producer_1 = require("./producer/producer");
const consumer_1 = require("./consumer/consumer");
class Channel {
    constructor(clContext, channel) {
        this.channel = channel;
        this.producerRegistry = new producer_1.ProducerRegistry(clContext);
        this.consumerRegistry = new consumer_1.ConsumerRegistry(clContext);
        this.foreground = null;
        this.background = null;
        this.spout = null;
    }
    async createSource(chanLay, params) {
        this.background = await this.producerRegistry.createSource(chanLay, params);
        return this.background != null;
    }
    async play() {
        if (this.background !== null) {
            this.foreground = this.background;
            this.background = null;
        }
        if (this.foreground != null)
            this.spout = await this.consumerRegistry.createSpout(this.channel, this.foreground);
        return Promise.resolve(this.spout != null);
    }
}
exports.Channel = Channel;
