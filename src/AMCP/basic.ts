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

import { Commands, ChanLayer } from './commands'
import {
	Demuxer,
	demuxer,
	Decoder,
	decoder,
	Filterer,
	filterer,
	Packet,
	Frame
} from '../../../beamcoder'
import redio, { RedioPipe, isEnd, isNil } from '../../../redioactive/src/redio'

const wait = async (t: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, t)
	})

class Player {
	private readonly id: string
	private demuxer: Demuxer | undefined
	private readonly decoders: Decoder[]
	private readonly filterers: Filterer[]
	private vidSource: RedioPipe<Packet> | undefined
	private vidDecode: RedioPipe<Frame> | undefined
	private vidFilter: RedioPipe<Frame> | undefined
	// private playing: NodeJS.Timeout | undefined

	constructor(id: string) {
		this.id = id
		this.decoders = []
		this.filterers = []
		console.log(`Created player ${this.id}`)
	}

	async setURL(url: string): Promise<void> {
		if (url) {
			this.demuxer = await demuxer(url)
			// console.log('NumStreams:', this.demuxer.streams.length)
			this.demuxer.streams.forEach((_s, i) => {
				// eslint-disable-next-line @typescript-eslint/camelcase
				this.decoders.push(decoder({ demuxer: this.demuxer as Demuxer, stream_index: i }))
			})

			const vidStream = this.demuxer.streams[0]
			this.filterers[0] = await filterer({
				filterType: 'video',
				inputParams: [
					{
						width: vidStream.codecpar.width,
						height: vidStream.codecpar.height,
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
	}

	play(): void {
		console.log(`${this.id}: play`)
		this.vidFilter?.each(async (frame) => {
			console.log('FRM:', frame.pts)
			return wait(1000)
		})
	}

	stop(): void {
		console.log(`${this.id}: stop`)
	}
}

interface PlayerEntry {
	chanLay: ChanLayer
	player: Player
}

export class Basic {
	private readonly players: PlayerEntry[]
	constructor() {
		this.players = []
	}

	/** Add the supported basic transport commands */
	addCmds(commands: Commands): void {
		commands.add({ cmd: 'LOADBG', fn: this.loadbg.bind(this) })
		commands.add({ cmd: 'LOAD', fn: this.load.bind(this) })
		commands.add({ cmd: 'PLAY', fn: this.play.bind(this) })
		commands.add({ cmd: 'PAUSE', fn: this.pause.bind(this) })
		commands.add({ cmd: 'RESUME', fn: this.resume.bind(this) })
		commands.add({ cmd: 'STOP', fn: this.stop.bind(this) })
		commands.add({ cmd: 'CLEAR', fn: this.clear.bind(this) })
	}

	/** Find the player instance for the specified layer */
	findPlayer(cl: ChanLayer): Player | undefined {
		const entry = this.players.find(
			({ chanLay }) => chanLay.channel === cl.channel && chanLay.layer === cl.layer
		)
		return entry?.player
	}

	/** Find or create if not found a player instance for the specified layer */
	createPlayer(cl: ChanLayer): Player {
		let result = this.findPlayer(cl)
		if (!result) {
			result = new Player(`${cl.channel}-${cl.layer}`)
			this.players.push({ chanLay: cl, player: result })
		}
		return result
	}

	/**
	 * Loads a producer in the background and prepares it for playout. If no layer is specified the default layer index will be used.
	 *
	 * _clip_ will be parsed by available registered producer factories. If a successfully match is found, the producer will be loaded into the background.
	 * If a file with the same name (extension excluded) but with the additional postfix _a is found this file will be used as key for the main clip.
	 *
	 * _loop_ will cause the clip to loop.
	 * When playing and looping the clip will start at _frame_.
	 * When playing and loop the clip will end after _frames_ number of frames.
	 *
	 * _auto_ will cause the clip to automatically start when foreground clip has ended (without play).
	 * The clip is considered "started" after the optional transition has ended.
	 *
	 * Note: only one clip can be queued to play automatically per layer.
	 */
	loadbg(chanLay: ChanLayer, params: string[]): boolean {
		console.log('loadbg', params)
		let curParam = 0
		const clip = params[curParam++]
		const loop = params.find((param) => param === 'LOOP') !== undefined
		console.log(clip, loop)
		return chanLay.valid
	}

	/**
	 * Loads a clip to the foreground and plays the first frame before pausing.
	 * If any clip is playing on the target foreground then this clip will be replaced.
	 */
	load(chanLay: ChanLayer, params: string[]): boolean {
		console.log('load', params)
		return chanLay.valid
	}

	/**
	 * Moves clip from background to foreground and starts playing it.
	 * If a transition (see LOADBG) is prepared, it will be executed.
	 * If additional parameters (see LOADBG) are provided then the provided clip will first be loaded to the background.
	 */
	play(chanLay: ChanLayer, params: string[]): boolean {
		console.log('play', params)
		const success = chanLay.valid
		if (success) {
			const player = this.createPlayer(chanLay)
			player
				.setURL(params[0])
				.then(() => player.play())
				.catch(console.error)
		}
		return success
	}

	/** Pauses playback of the foreground clip on the specified layer. The RESUME command can be used to resume playback again. */
	pause(chanLay: ChanLayer, params: string[]): boolean {
		console.log('pause', params)
		return chanLay.valid
	}

	/** Resumes playback of a foreground clip previously paused with the PAUSE command. */
	resume(chanLay: ChanLayer, params: string[]): boolean {
		console.log('resume', params)
		return chanLay.valid
	}

	/** Removes the foreground clip of the specified layer */
	stop(chanLay: ChanLayer, params: string[]): boolean {
		console.log('stop', params)
		let success = chanLay.valid
		if (success) {
			const player = this.findPlayer(chanLay)
			if (!player) success = false
			player?.stop()
		}
		return success
	}

	/**
	 * Removes all clips (both foreground and background) of the specified layer.
	 * If no layer is specified then all layers in the specified video_channel are cleared.
	 */
	clear(chanLay: ChanLayer, params: string[]): boolean {
		console.log('clear', params)
		return chanLay.valid
	}
}
