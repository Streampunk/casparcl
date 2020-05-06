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
import { ProducerFactory, Producer, InvalidProducerError } from './producer'
import { clContext as nodenCLContext, OpenCLBuffer } from 'nodencl'
import { Demuxer, demuxer, Decoder, decoder, Filterer, filterer, Packet, Frame } from 'beamcoder'
import redio, { RedioPipe, isEnd, isNil } from 'redioactive'
import { ToRGBA } from '../process/io'
import { Reader } from '../process/yuv422p10'

export class FFmpegProducer implements Producer {
	private readonly id: string
	private params: string[]
	private clContext: nodenCLContext
	private demuxer: Demuxer | undefined
	private readonly decoders: Decoder[]
	private readonly filterers: Filterer[]
	private vidSource: RedioPipe<Packet> | undefined
	private vidDecode: RedioPipe<Frame> | undefined
	private vidFilter: RedioPipe<Frame> | undefined
	private vidLoader: RedioPipe<Array<OpenCLBuffer>> | undefined
	private vidProcess: RedioPipe<SourceFrame> | undefined
	private toRGBA: ToRGBA | undefined

	constructor(id: string, params: string[], context: nodenCLContext) {
		this.id = id
		this.params = params
		this.clContext = context
		this.decoders = []
		this.filterers = []
		this.clContext.logBuffers()
	}

	async initialise(): Promise<RedioPipe<SourceFrame> | null> {
		const url = this.params[0]
		let width = 0
		let height = 0
		try {
			this.demuxer = await demuxer(url)
			// console.log('NumStreams:', this.demuxer.streams.length)
			this.demuxer.streams.forEach((_s, i) => {
				// eslint-disable-next-line @typescript-eslint/camelcase
				this.decoders.push(decoder({ demuxer: this.demuxer as Demuxer, stream_index: i }))
			})

			const vidStream = this.demuxer.streams[0]
			width = vidStream.codecpar.width
			height = vidStream.codecpar.height
			this.filterers[0] = await filterer({
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
			})

			this.toRGBA = new ToRGBA(
				this.clContext,
				'709',
				'709',
				new Reader(vidStream.codecpar.width, vidStream.codecpar.height)
			)
			await this.toRGBA.init()
		} catch (err) {
			throw new InvalidProducerError(err)
		}

		this.vidSource = redio(
			async (push, next) => {
				const packet = await this.demuxer?.read()
				// console.log('PKT:', packet?.stream_index, packet?.pts)
				if (packet && packet?.stream_index === 0) push(packet)
				next()
			},
			{ bufferSizeMax: 3 }
		)

		this.vidDecode = this.vidSource.valve<Frame>(
			async (packet) => {
				if (!isEnd(packet) && !isNil(packet)) {
					const pkt = packet as Packet
					const frm = await this.decoders[pkt.stream_index].decode(pkt)
					return frm.frames
				} else {
					return packet
				}
			},
			{ bufferSizeMax: 3, oneToMany: true }
		)

		this.vidFilter = this.vidDecode.valve<Frame>(
			async (frame) => {
				if (!isEnd(frame) && !isNil(frame)) {
					const frm = frame as Frame
					const ff = await this.filterers[0].filter([frm])
					return ff[0].frames
				} else {
					return frame
				}
			},
			{ bufferSizeMax: 3, oneToMany: true }
		)

		this.vidLoader = this.vidFilter.valve<Array<OpenCLBuffer>>(
			async (frame) => {
				if (!isEnd(frame) && !isNil(frame)) {
					const frm = frame as Frame
					const toRGBA = this.toRGBA as ToRGBA
					const clSources = await toRGBA.createSources()
					await toRGBA.loadFrame(frm.data, clSources, this.clContext.queue.load)
					await this.clContext.waitFinish(this.clContext.queue.load)
					return clSources
				} else {
					return frame
				}
			},
			{ bufferSizeMax: 3, oneToMany: false }
		)

		this.vidProcess = this.vidLoader.valve<SourceFrame>(
			async (clSources) => {
				if (!isEnd(clSources) && !isNil(clSources)) {
					const clSrcs = clSources as Array<OpenCLBuffer>
					const toRGBA = this.toRGBA as ToRGBA
					const clDest = await toRGBA.createDest({ width: width, height: height })
					await toRGBA.processFrame(clSrcs, clDest, this.clContext.queue.process)
					await this.clContext.waitFinish(this.clContext.queue.process)
					clSrcs.forEach((s) => s.release())
					const sourceFrame: SourceFrame = { video: clDest, audio: Buffer.alloc(0), timestamp: 0 }
					return sourceFrame
				} else {
					return clSources
				}
			},
			{ bufferSizeMax: 3, oneToMany: false }
		)

		console.log(`Created FFmpeg producer ${this.id} for path ${url}`)
		return this.vidProcess
	}
}

export class FFmpegProducerFactory implements ProducerFactory<FFmpegProducer> {
	private clContext: nodenCLContext

	constructor(clContext: nodenCLContext) {
		this.clContext = clContext
	}

	createProducer(id: string, params: string[]): FFmpegProducer {
		return new FFmpegProducer(id, params, this.clContext)
	}
}
