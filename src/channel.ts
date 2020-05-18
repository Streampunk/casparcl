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

import { clContext as nodenCLContext, OpenCLBuffer } from 'nodencl'
import { ChanLayer, SourceFrame } from './chanLayer'
import { ProducerRegistry } from './producer/producer'
import { ConsumerRegistry } from './consumer/consumer'
import { RedioPipe, RedioStream } from 'redioactive'

export class Channel {
	private readonly channel: number
	private readonly producerRegistry: ProducerRegistry
	private readonly consumerRegistry: ConsumerRegistry
	private foreground: RedioPipe<SourceFrame> | null
	private background: RedioPipe<SourceFrame> | null
	private spout: RedioStream<OpenCLBuffer> | null

	constructor(clContext: nodenCLContext, channel: number) {
		this.channel = channel
		this.producerRegistry = new ProducerRegistry(clContext)
		this.consumerRegistry = new ConsumerRegistry(clContext)
		this.foreground = null
		this.background = null
		this.spout = null
	}

	async createSource(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		this.background = await this.producerRegistry.createSource(chanLay, params)
		return this.background != null
	}

	async play(): Promise<boolean> {
		if (this.background !== null) {
			this.foreground = this.background
			this.background = null
		}

		if (this.foreground != null)
			this.spout = await this.consumerRegistry.createSpout(this.channel, this.foreground)

		return Promise.resolve(this.spout != null)
	}
}
