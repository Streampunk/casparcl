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

import { start, processCommand } from './AMCP/server'
import { Commands } from './AMCP/commands'
import { Basic } from './AMCP/basic'
import Koa from 'koa'
import cors from '@koa/cors'
import readline from 'readline'

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: 'AMCP> '
})

rl.on('line', (input) => {
	if (input === 'q') {
		process.kill(process.pid, 'SIGTERM')
	}

	if (input !== '') {
		console.log(`AMCP received: ${input}`)
		processCommand(input.toUpperCase().match(/"[^"]+"|""|\S+/g))
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
const basic = new Basic()
basic.addCmds(commands)

start(commands).then(console.log, console.error)
