const H = require('highland')
const beamy = require('beamcoder')

async function run() {
	let dm = await beamy.demuxer('file:../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf')
	console.log(dm)
	let dec = await beamy.decoder({ demuxer: dm, stream_index: 0 })
	H((push, next) => {
		dm.read().then(p => { push(null, p); next(); })
	}).filter(p => p.stream_index === 0)
	.flatMap(p => H(dec.decode(p)))
	.ratelimit(1, 40)
	.each(H.log).done(() => { dec.flush() }
}

run()
