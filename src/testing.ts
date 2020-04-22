// import redio from '../../redioactive/src/redio'
import beamcoder from 'beamcoder'
import nodencl from 'nodencl'

// let [counter1, counter2] = [0, 0]

// enum MediaType {
// 	VIDEO = 'VIDEO',
// 	AUDIO = 'AUDIO',
// 	DATA = 'DATA'
// }

// interface Packet {
// 	name: string
// 	mediaType: MediaType
// 	pts: number
// }

const testImage = `
__constant sampler_t sampler =
      CLK_NORMALIZED_COORDS_FALSE
    | CLK_ADDRESS_CLAMP_TO_EDGE
    | CLK_FILTER_NEAREST;

__kernel void
  testImage(__read_only image2d_t input,
            __write_only image2d_t output) {

    int x = get_global_id(0);
    int y = get_global_id(1);
    float4 in = read_imagef(input, sampler, (int2)(x,y));
    write_imagef(output, (int2)(x,y), in);
  }
`

async function init(): Promise<nodencl.clContext> {
	// const platformsInfo = nodencl.getPlatformInfo()
	// const platInfo = platformsInfo[0]
	// const devInfo = platInfo.devices[0]
	// console.dir(platformsInfo, { getters: true, depth: 2 })

	const platformIndex = 0
	const deviceIndex = 0
	const context = new nodencl.clContext({
		platformIndex: platformIndex,
		deviceIndex: deviceIndex,
		overlapping: false
	})

	console.dir(await context.getPlatformInfo(), { getters: true, depth: null })
	const width = 1920
	const height = 1080
	const clProg = await context.createProgram(testImage, {
		globalWorkItems: Uint32Array.from([width, height])
	})
	// console.dir(clProg, { getters: true, depth: null })

	const numBytesRGBA = width * height * 4 * 4
	const rgbaDst = await context.createBuffer(
		numBytesRGBA,
		'readwrite',
		'coarse',
		{ width: width, height: height },
		'me'
	)
	const imageDst = await context.createBuffer(
		numBytesRGBA,
		'readwrite',
		'coarse',
		{ width: width, height: height },
		'me'
	)

	context.logBuffers()

	await rgbaDst.hostAccess('readwrite')
	// console.dir(context, { getters: true, depth: null })

	// console.dir(rgbaDst, { getters: true, depth: null })

	const timings = await clProg.run({ input: rgbaDst, output: imageDst })
	console.log(timings)

	await context.waitFinish()
	context.releaseBuffers('me')
	context.close(() => console.log('Done!!'))

	return context

	const urls = ['file:../../Media/big_buck_bunny_1080p_h264.mov']
	const spec = { start: 0, end: 24 }

	const params = {
		video: [
			{
				sources: [{ url: urls[0], ms: spec, streamIndex: 0 }],
				filterSpec: '[in0:v] scale=1280:720, colorspace=all=bt709 [out0:v]',
				streams: [
					{
						name: 'h264',
						// eslint-disable-next-line @typescript-eslint/camelcase
						time_base: [1, 90000],
						codecpar: {
							width: 1280,
							height: 720,
							format: 'yuv422p',
							// eslint-disable-next-line @typescript-eslint/camelcase
							color_space: 'bt709',
							// eslint-disable-next-line @typescript-eslint/camelcase
							sample_aspect_ratio: [1, 1]
						}
					}
				]
			}
		],
		audio: [
			{
				sources: [{ url: urls[0], ms: spec, streamIndex: 2 }],
				filterSpec: '[in0:a] aformat=sample_fmts=fltp:channel_layouts=mono [out0:a]',
				streams: [
					{
						name: 'aac',
						// eslint-disable-next-line @typescript-eslint/camelcase
						time_base: [1, 90000],
						codecpar: {
							// eslint-disable-next-line @typescript-eslint/camelcase
							sample_rate: 48000,
							format: 'fltp',
							// eslint-disable-next-line @typescript-eslint/camelcase
							frame_size: 1024,
							channels: 1,
							// eslint-disable-next-line @typescript-eslint/camelcase
							channel_layout: 'mono'
						}
					}
				]
			}
		],
		out: {
			formatName: 'mp4',
			url: 'file:temp.mp4'
		}
	}

	console.dir(params, { getters: true, depth: 4 })
	await beamcoder.makeSources(params)
	// const beamStreams = await beamcoder.makeStreams(params)
	console.dir(params, { getters: true, depth: 4 })

	const demuxer = await beamcoder.demuxer({
		url: '../../media/dpp/AS11_DPP_HD_EXAMPLE_1.mxf',
		options: {
			probesize: 10000000
		}
	})
	// console.dir(demuxer, { getters: true, depth: 3 });
	const stream: beamcoder.Stream = demuxer.streams[0]
	// const cp: beamcoder.CodecPar = stream.codecpar
	// console.dir(JSON.parse(JSON.stringify(stream)), { getters: true, depth: null })
	await demuxer.seek({ time: 40 })
	const pkt = await demuxer.read()
	// console.dir(pkt, { getters: true, depth: null });
	// console.dir(JSON.parse(JSON.stringify(stream)), { getters: true })
	// console.dir(beamcoder.decoders(), { getters: true, depth: null })
	// const decoder = beamcoder.decoder({ name: stream.codecpar.name })
	// const decResult = await decoder.decode(pkt)
	// // console.dir(decoder, { getters: true, depth: null });
	// const filt = await beamcoder.filterer({
	// 	filterType: 'video',
	// 	inputParams: [
	// 		{
	// 			width: stream.codecpar.width,
	// 			height: stream.codecpar.height,
	// 			pixelFormat: stream.codecpar.format,
	// 			timeBase: stream.time_base,
	// 			pixelAspect: stream.sample_aspect_ratio
	// 		}
	// 	],
	// 	outputParams: [
	// 		{
	// 			pixelFormat: 'yuv422'
	// 		}
	// 	],
	// 	filterSpec: 'scale=1280:720'
	// })
	// const scaleFilter = filt.graph.filters.find(f => 'scale' === f.filter.name) // find the first 'scale' filter
	// console.dir(scaleFilter, { getters: true, depth: null });

	// console.dir(filt, { getters: true, depth: null });
	// console.log(filt.graph.dump())
	// console.log(dec_result)
	// const filtResult = await filt.filter(decResult.frames)
	// console.dir(filtResult, { getters: true, depth: 2 });

	// const encParams = {
	// 	name: 'libx264',
	// 	width: 1280,
	// 	height: 720,
	// 	// bit_rate: 10000000,
	// 	// eslint-disable-next-line @typescript-eslint/camelcase
	// 	time_base: [1, 25],
	// 	framerate: [25, 1],
	// 	// gop_size: 50,
	// 	// max_b_frames: 1,
	// 	// eslint-disable-next-line @typescript-eslint/camelcase
	// 	pix_fmt: 'yuv422p',
	// 	// eslint-disable-next-line @typescript-eslint/camelcase
	// 	priv_data: {
	// 		crf: 23
	// 		// preset: 'slow',
	// 		// profile: 'high422',
	// 		// level: '4.2'
	// 	}
	// }
	// const encoder = beamcoder.encoder(encParams)
	// const encResult = await encoder.encode(decResult.frames)
	// console.dir(encoder, { getters: true, depth: null });
	const muxer = beamcoder.muxer({ name: 'mxf', filename: 'test.mxf' })
	// muxer.newStream({ name: 'pcm_s16le', time_base: [1, 48000] })
	muxer.newStream(stream)
	// console.dir(muxer, { getters: true, depth: 3 })
	await muxer.openIO()
	await muxer.initOutput()
	await muxer.writeHeader()
	await muxer.writeFrame(pkt)
	await muxer.writeTrailer()
	setTimeout(() => {
		console.log(muxer.max_chunk_size)
	}, 5000)
}

// const mediaPromise = (n: number, name: string): Promise<Packet> =>
// 	new Promise((resolve, reject) => {
// 		setTimeout(
// 			() => {
// 				switch (n % 4) {
// 					case 0:
// 						resolve({
// 							name,
// 							mediaType: MediaType.VIDEO,
// 							pts: ((n / 4) | 0) * 90000
// 						})
// 						break
// 					case 1:
// 					case 2:
// 						resolve({
// 							name,
// 							mediaType: MediaType.AUDIO,
// 							pts: ((n / 4) | 0) * 90000
// 						})
// 						break
// 					case 3:
// 						resolve({
// 							name,
// 							mediaType: MediaType.DATA,
// 							pts: ((n / 4) | 0) * 90000
// 						})
// 						break
// 					default:
// 						reject(new Error('Oh Blimey!'))
// 						break
// 				}
// 			},
// 			n % 4 === 0 ? 5 : 1
// 		)
// 	})

// const mixerPromise = (s1: Packet, s2: Packet): Promise<Packet> =>
// 	new Promise((resolve) => {
// 		setTimeout(() => {
// 			resolve({
// 				name: `mix(${s1.name}, ${s2.name})`,
// 				mediaType: s1.mediaType,
// 				pts: s1.pts
// 			})
// 		}, 12)
// 	})

// let source1 : Highland.Stream<Packet> = H((push, next) =>
//   mediaPromise(counter1++, 'Source1').then(p => { push(null, p); next(); }))
// const source1 = redio(
// 	async () => {
// 		return mediaPromise(counter1++, 'Source1')
// 	},
// 	{ oneToMany: true }
// )

// let source2 : Highland.Stream<Packet> = H(async (push, next) => {
// 	let packet = await mediaPromise(counter2++, 'Source2')
// 	push(null, packet)
// 	next()
// })
// const source2 = redio(
// 	async () => {
// 		const packet = await mediaPromise(counter2++, 'Source2')
// 		return packet
// 	},
// 	{ oneToMany: true }
// )

// let video1: Highland.Stream<Packet> = source1.fork().filter((x: any) => x.mediaType === MediaType.VIDEO)
// let audio1: Highland.Stream<Packet> = source1.fork().filter((x: any) => x.mediaType === MediaType.AUDIO)

// let video1 = source1.filter((x: any) => x.mediaType === MediaType.VIDEO)
// let audio1 = source1.filter((x: any) => x.mediaType === MediaType.AUDIO)

// let video2: Highland.Stream<Packet> = source2.fork().filter((x: any) => x.mediaType === MediaType.VIDEO)
// let audio2: Highland.Stream<Packet> = source2.fork().filter((x: any) => x.mediaType === MediaType.AUDIO)

// let video2 = source2.filter((x: any) => x.mediaType === MediaType.VIDEO)
// let audio2 = source2.filter((x: any) => x.mediaType === MediaType.AUDIO)

// let vmix = video1.zip(video2).flatMap((x: [Packet, Packet]) => H(mixerPromise(x[0], x[1])))
// let vmix = video1.zip(video2);

// let amix = audio1.zip(audio2).flatMap((x: [Packet, Packet]) => H(mixerPromise(x[0], x[1])))
// let amix = audio1.zip(audio2);

// H([vmix, amix]).merge().ratelimit(3, 200).each(H.log)
// audio.each(H.log)
// video1.each(console.log, { debug: true })
// 	.done(() => { console.log('There we go!') })

init()
	.then(() => console.log('Finished'))
	.catch(console.error)
