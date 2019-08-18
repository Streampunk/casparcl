	import H from 'highland'

let counter = 0

enum MediaType {
	VIDEO = 'VIDEO',
	AUDIO = 'AUDIO',
	DATA = 'DATA'
}

let mediaPromise = (n: number) => new Promise((resolve, reject) => {
	setTimeout(() => {
		switch (n % 4) {
			case 0:
				resolve({
					mediaType: MediaType.VIDEO,
					pts: (n / 4 | 0) * 90000
				})
				break
			case 1:
			case 2:
				resolve({
					mediaType: MediaType.AUDIO,
					pts: (n / 4 | 0) * 90000
				})
				break
			case 3:
				resolve({
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

let source = H(async (push, next) => {
	let packet = await mediaPromise(counter++)
	push(null, packet)
	next()
})

let video = source.fork().filter((x: any) => x.mediaType === MediaType.VIDEO)
let audio = source.fork().filter((x: any) => x.mediaType === MediaType.AUDIO)

H([H([1, 2, 3]), H([4,5])]).sequence().each(H.log)
//audio.each(H.log)
