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
import { SourceFrame } from '../chanLayer'
import { MacadamConsumerFactory } from './macadamConsumer'
import { RedioPipe, RedioStream } from 'redioactive'

export interface Consumer {
	initialise(pipe: RedioPipe<SourceFrame>): Promise<RedioStream<OpenCLBuffer> | null>
}

export interface ConsumerFactory<T extends Consumer> {
	createConsumer(channel: number): T
}

export class InvalidConsumerError extends Error {
	constructor(message?: string) {
		super(message)
		// see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
		Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
		this.name = InvalidConsumerError.name // stack traces display correctly now
	}
}
export class ConsumerRegistry {
	private readonly consumerFactories: ConsumerFactory<Consumer>[]

	constructor(clContext: nodenCLContext) {
		this.consumerFactories = []
		this.consumerFactories.push(new MacadamConsumerFactory(clContext))
	}

	async createSpout(
		channel: number,
		pipe: RedioPipe<SourceFrame>
	): Promise<RedioStream<OpenCLBuffer> | null> {
		let p: RedioStream<OpenCLBuffer> | null = null
		for (const f of this.consumerFactories) {
			try {
				const consumer = f.createConsumer(channel) as Consumer
				if ((p = await consumer.initialise(pipe)) !== null) break
			} catch (err) {
				if (!(err instanceof InvalidConsumerError)) {
					throw err
				}
			}
		}

		if (p === null) {
			console.log(`Failed to find consumer for channel: '${channel}'`)
		}

		return p
	}
}
