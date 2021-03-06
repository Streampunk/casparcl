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
import { Commands } from './commands'
import { ChanLayer } from '../chanLayer'
import { Channel } from '../channel'

export class Basic {
	private readonly channels: Array<Channel>

	constructor(clContext: nodenCLContext) {
		this.channels = Array.from([1, 2, 3, 4], (c) => new Channel(clContext, c))
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
	async loadbg(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		if (!chanLay.valid) return Promise.resolve(false)

		let curParam = 0
		const clip = params[curParam++]
		const loop = params.find((param) => param === 'LOOP') !== undefined
		const autoPlay = params.find((param) => param === 'AUTO') !== undefined
		console.log(`loadbg: clip '${clip}', loop ${loop}, auto play ${autoPlay}`)

		const bgOK = this.channels[chanLay.channel - 1].createSource(chanLay, params)

		return bgOK
	}

	/**
	 * Loads a clip to the foreground and plays the first frame before pausing.
	 * If any clip is playing on the target foreground then this clip will be replaced.
	 */
	async load(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		if (!chanLay.valid) return Promise.resolve(false)

		const bgOK = this.channels[chanLay.channel - 1].createSource(chanLay, params)

		return bgOK
	}

	/**
	 * Moves clip from background to foreground and starts playing it.
	 * If a transition (see LOADBG) is prepared, it will be executed.
	 * If additional parameters (see LOADBG) are provided then the provided clip will first be loaded to the background.
	 */
	async play(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		if (!chanLay.valid) return Promise.resolve(false)

		if (params.length !== 0) await this.loadbg(chanLay, params)

		const fgOK = this.channels[chanLay.channel - 1].play()

		return fgOK
	}

	/** Pauses playback of the foreground clip on the specified layer. The RESUME command can be used to resume playback again. */
	async pause(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		console.log('pause', params)
		return chanLay.valid
	}

	/** Resumes playback of a foreground clip previously paused with the PAUSE command. */
	async resume(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		console.log('resume', params)
		return chanLay.valid
	}

	/** Removes the foreground clip of the specified layer */
	async stop(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		console.log('stop', params)
		return chanLay.valid
	}

	/**
	 * Removes all clips (both foreground and background) of the specified layer.
	 * If no layer is specified then all layers in the specified video_channel are cleared.
	 */
	async clear(chanLay: ChanLayer, params: string[]): Promise<boolean> {
		console.log('clear', params)
		return chanLay.valid
	}
}
