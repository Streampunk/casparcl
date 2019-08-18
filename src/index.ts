	import H from 'highland'

let [counter1, counter2] = [0, 0]

enum MediaType {
	VIDEO = 'VIDEO',
	AUDIO = 'AUDIO',
	DATA = 'DATA'
}

interface Packet {
	name: string
	mediaType: MediaType
	pts: number
}

let mediaPromise = (n: number, name: string): Promise<Packet> => new Promise((resolve, reject) => {
	setTimeout(() => {
		switch (n % 4) {
			case 0:
				resolve({
					name,
					mediaType: MediaType.VIDEO,
					pts: (n / 4 | 0) * 90000
				})
				break
			case 1:
			case 2:
				resolve({
					name,
					mediaType: MediaType.AUDIO,
					pts: (n / 4 | 0) * 90000
				})
				break
			case 3:
				resolve({
					name,
					mediaType: MediaType.DATA,
					pts: (n / 4 | 0) * 90000
				})
				break
			default:
				reject(new Error('Oh Blimey!'))
				break
		}
	}, n % 4 === 0 ? 5 : 1)
})

let mixerPromise = (s1: Packet, s2: Packet) => new Promise((resolve, reject) => {
	setTimeout(() => {
		resolve({
			name: `mix(${s1.name}, ${s2.name})`,
			mediaType: s1.mediaType,
			pts: s1.pts
		})
	}, 12)
})

let source1 : Highland.Stream<Packet> = H(async (push, next) => {
	let packet = await mediaPromise(counter1++, 'Source1')
	push(null, packet)
	next()
})

let source2 : Highland.Stream<Packet> = H(async (push, next) => {
	let packet = await mediaPromise(counter2++, 'Source2')
	push(null, packet)
	next()
})

let video1: Highland.Stream<Packet> = source1.fork().filter((x: any) => x.mediaType === MediaType.VIDEO)
let audio1: Highland.Stream<Packet> = source1.fork().filter((x: any) => x.mediaType === MediaType.AUDIO)

let video2: Highland.Stream<Packet> = source2.fork().filter((x: any) => x.mediaType === MediaType.VIDEO)
let audio2: Highland.Stream<Packet> = source2.fork().filter((x: any) => x.mediaType === MediaType.AUDIO)

// @ts-ignore: typescirpt deinition is wrong for zip
let vmix = video1.zip(video2).flatMap((x: [Packet, Packet]) => H(mixerPromise(x[0], x[1])))

// @ts-ignore: typescirpt deinition is wrong for zip
let amix = audio1.zip(audio2).flatMap((x: [Packet, Packet]) => H(mixerPromise(x[0], x[1])))


// @ts-ignore Typescript getting its knickers twisted over this: parameter for stream of streams
H([vmix, amix]).merge().ratelimit(3, 200).each(H.log)
//audio.each(H.log)
