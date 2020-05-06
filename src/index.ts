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
import { start, processCommand } from './AMCP/server'
import { Commands } from './AMCP/commands'
import { Basic } from './AMCP/basic'
import Koa from 'koa'
import cors from '@koa/cors'
import readline from 'readline'

const initialiseOpenCL = async (): Promise<nodenCLContext> => {
	const platformIndex = 0
	const deviceIndex = 0
	const clContext = new nodenCLContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex,
		overlapping: true
	})
	await clContext.initialise()
	const platformInfo = clContext.getPlatformInfo()
	console.log(
		`OpenCL accelerator running on device from vendor '${platformInfo.vendor}', type '${platformInfo.devices[deviceIndex].type}'`
	)
	return clContext
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: 'AMCP> '
})

rl.on('line', async (input) => {
	if (input === 'q') {
		process.kill(process.pid, 'SIGTERM')
	}

	if (input !== '') {
		console.log(`AMCP received: ${input}`)
		await processCommand(input.toUpperCase().match(/"[^"]+"|""|\S+/g))
	}

	rl.prompt()
})

rl.on('SIGINT', () => {
	process.kill(process.pid, 'SIGTERM')
})

// 960 * 540 RGBA 8-bit
const lastWeb = Buffer.alloc(1920 * 1080)

const kapp = new Koa()
kapp.use(cors())
kapp.use((ctx) => {
	ctx.body = lastWeb
})
const server = kapp.listen(3001)
process.on('SIGHUP', () => server.close)

const commands: Commands = new Commands()
initialiseOpenCL().then((context) => {
	const basic = new Basic(context)
	basic.addCmds(commands)
})

start(commands).then((fulfilled) => console.log('Command:', fulfilled), console.error)
