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

import { SourceFrame } from '../chanLayer'
import { clContext as nodenCLContext, OpenCLBuffer } from 'nodencl'
import { ConsumerFactory, Consumer } from './consumer'
import { RedioPipe, RedioStream, nil, isEnd, isNil } from 'redioactive'
import * as Macadam from 'macadam'
import { FromRGBA } from '../process/io'
import { Writer } from '../process/v210'

export class MacadamConsumer implements Consumer {
	private readonly channel: number
	private clContext: nodenCLContext
	private playback: Macadam.PlaybackChannel | null = null
	private fromRGBA: FromRGBA | undefined
	private vidProcess: RedioPipe<OpenCLBuffer> | undefined
	private vidSaver: RedioPipe<OpenCLBuffer> | undefined
	private spout: RedioStream<OpenCLBuffer> | undefined
	private clDests: Array<OpenCLBuffer> | undefined
	private field: number
	private frameNumber: number
	private readonly latency: number

	constructor(channel: number, context: nodenCLContext) {
		this.channel = channel
		this.clContext = context
		this.field = 0
		this.frameNumber = 0
		this.latency = 3
	}

	async initialise(pipe: RedioPipe<SourceFrame>): Promise<RedioStream<OpenCLBuffer> | null> {
		this.playback = await Macadam.playback({
			deviceIndex: this.channel - 1,
			displayMode: Macadam.bmdModeHD1080i50,
			pixelFormat: Macadam.bmdFormat10BitYUV
		})

		this.fromRGBA = new FromRGBA(
			this.clContext,
			'709',
			new Writer(
				this.playback.width,
				this.playback.height,
				this.playback.fieldDominance != 'progressiveFrame'
			)
		)
		await this.fromRGBA.init()

		this.vidProcess = pipe.valve<OpenCLBuffer>(
			async (frame) => {
				if (!isEnd(frame) && !isNil(frame)) {
					const fromRGBA = this.fromRGBA as FromRGBA
					if (this.field === 0) this.clDests = await fromRGBA.createDests()
					const clDests = this.clDests as Array<OpenCLBuffer>
					const srcFrame = frame as SourceFrame
					const queue = this.clContext.queue.process
					const interlace = 0x1 | (this.field << 1)
					await fromRGBA.processFrame(srcFrame.video, clDests, queue, interlace)
					await this.clContext.waitFinish(queue)
					srcFrame.video.release()
					this.field = 1 - this.field
					return this.field === 1 ? nil : clDests[0]
				} else {
					return frame
				}
			},
			{ bufferSizeMax: 3, oneToMany: false }
		)

		this.vidSaver = this.vidProcess.valve<OpenCLBuffer>(
			async (frame) => {
				if (!isEnd(frame) && !isNil(frame)) {
					const v210Frame = frame as OpenCLBuffer
					const fromRGBA = this.fromRGBA as FromRGBA
					await fromRGBA.saveFrame(v210Frame, this.clContext.queue.unload)
					await this.clContext.waitFinish(this.clContext.queue.unload)
					return v210Frame
				} else {
					return frame
				}
			},
			{ bufferSizeMax: 3, oneToMany: false }
		)

		this.spout = this.vidSaver.spout(
			async (frame) => {
				if (!isEnd(frame) && !isNil(frame)) {
					const v210Frame = frame as OpenCLBuffer
					this.playback?.schedule({ video: v210Frame, time: 1000 * this.frameNumber })
					if (this.frameNumber === this.latency) this.playback?.start({ startTime: 0 })
					if (this.frameNumber >= this.latency)
						await this.playback?.played((this.frameNumber - this.latency) * 1000)

					this.frameNumber++
					v210Frame.release()
					return Promise.resolve()
				} else {
					return Promise.resolve()
				}
			},
			{ bufferSizeMax: 3, oneToMany: false }
		)

		console.log(`Created Macadam consumer for Blackmagic id: ${this.channel - 1}`)
		return this.spout
	}
}

export class MacadamConsumerFactory implements ConsumerFactory<MacadamConsumer> {
	private clContext: nodenCLContext

	constructor(clContext: nodenCLContext) {
		this.clContext = clContext
	}

	createConsumer(channel: number): MacadamConsumer {
		return new MacadamConsumer(channel, this.clContext)
	}
}
