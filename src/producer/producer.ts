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

import { clContext as nodenCLContext } from 'nodencl'
import { ChanLayer, SourceFrame } from '../chanLayer'
import { FFmpegProducerFactory } from './ffmpegProducer'
import { RedioPipe } from 'redioactive'

export interface Producer {
	initialise(): Promise<RedioPipe<SourceFrame> | null>
}

export interface ProducerFactory<T extends Producer> {
	createProducer(id: string, params: string[]): T
}

export class InvalidProducerError extends Error {
	constructor(message?: string) {
		super(message)
		// see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
		Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
		this.name = InvalidProducerError.name // stack traces display correctly now
	}
}
export class ProducerRegistry {
	private readonly producerFactories: ProducerFactory<Producer>[]

	constructor(clContext: nodenCLContext) {
		this.producerFactories = []
		this.producerFactories.push(new FFmpegProducerFactory(clContext))
	}

	async createSource(chanLay: ChanLayer, params: string[]): Promise<RedioPipe<SourceFrame> | null> {
		const id = `${chanLay.channel}-${chanLay.layer}`
		let p: RedioPipe<SourceFrame> | null = null
		for (const f of this.producerFactories) {
			try {
				const producer = f.createProducer(id, params) as Producer
				if ((p = await producer.initialise()) !== null) break
			} catch (err) {
				if (!(err instanceof InvalidProducerError)) {
					throw err
				}
			}
		}

		if (p === null) {
			console.log(`Failed to find producer for params: '${params}'`)
		}

		return p
	}
}
