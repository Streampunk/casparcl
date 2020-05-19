const H = require('highland')
const beamy = require('beamcoder')
const macadam = require('macadam')

async function run() {
	let dm = await beamy.demuxer('file:../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	console.log(dm)
	let dec = await beamy.decoder({ demuxer: dm, stream_index: 0 })
	let enc = beamy.encoder({
		name: 'v210',
		codec_id: 127,
		width: 1920,
		height: 1080,
		pix_fmt: 'yuv422p10le',
		bits_per_raw_sample: 20,
		time_base: [1, 25]
	})
	console.log(enc, enc._codecPar)

	let playback = await macadam.playback({
		deviceIndex: 0, // Index relative to the 'macadam.getDeviceInfo()' array
		displayMode: macadam.bmdModeHD1080i50,
		pixelFormat: macadam.bmdFormat10BitYUV
	})

	let stamp = process.hrtime()

	H((push, next) => {
		dm.read().then((p) => {
			push(null, p)
			next()
		})
	})
		.filter((p) => p.stream_index === 0)
		.drop(2000)
		.flatMap((p) => H(dec.decode(p)))
		//.tap(x => console.log(x.frames, x.frames[0].data.map(x => x.length)))
		.flatMap((p) => {
			return H(enc.encode(p.frames))
		})
		.flatMap((p) => H(playback.displayFrame(p.packets[0].data)))
		.consume((err, x, push, next) => {
			let wait = 40 - process.hrtime(stamp)[1] / 1000000
			if (err) {
				push(err)
				next()
			} else if (x === H.nil) {
				push(null, x)
			} else {
				// console.log('wait', wait)
				setTimeout(
					() => {
						push(null, x)
						next()
					},
					wait > 0 ? wait : 0
				)
			}
		})
		.each(() => {
			console.log(process.hrtime(stamp))
			stamp = process.hrtime()
		})
		.done(() => {
			dec.flush()
		})
}

run()
