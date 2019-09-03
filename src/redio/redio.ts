export interface PromiseMaker<T> {
	(): Promise<T>
}

let bufferSizeMax = 10

export class RedioStart<T> {
	private _maker: PromiseMaker<T>
	private _buffer: T[] = []
	private _running: boolean = true
	private _follow: RedioEnd<T> | null = null

	constructor(maker: PromiseMaker<T>) {
		this._maker = maker
		this.next()
	}

	each(dotoall: (x: T) => any): RedioEnd<T> {
		this._follow = new RedioEnd(this, dotoall);
		return this._follow
	}

	async next() {
		if (this._running) {
			let result = await this._maker()
			this.push(result)
			this.next()
		}
	}

	push(x: T) {
		this._buffer.push(x)
		if (this._buffer.length >= bufferSizeMax) this._running = false
		if (this._follow) this._follow.next()
	}

	pull(): T | null {
		let val = this._buffer.shift()
		if (!this._running && this._buffer.length < 0.7 * bufferSizeMax) {
			this._running = true
			this.next()
		}
		return val ? val : null;
	}
}

export class RedioEnd<T> {
	private _dotoall: (x: T) => any
	private _prev: RedioStart<T>

	constructor(prev: RedioStart<T>, dotoall: (x: T) => any) {
		this._dotoall = dotoall
		this._prev = prev
		this.next()
	}

	next() {
		let v: T | null = this._prev.pull()
		if (v) {
			this._dotoall(v)
		}
	}
}

let test = new RedioStart(() => new Promise((resolve) => setTimeout(resolve, 1000)))
test.each(console.log)
