const H = require('highland')

const wait = (d) => (v) => new Promise((resolve, reject) => {
	setTimeout(() => resolve(v), d)
})

let genc = 0
let sc = 0
let stamp = process.hrtime()

let eagerPromer = p => {
	let ep = (err, x, push, next) => {
		console.log('>>> EAGER <<<', sc)
		if (err) {
			push(err);
			next();
		} else if (x === H.nil) {
			push(null, x);
		} else {
			next()
			p(x).then(m => {
				push(null, m)
			})
		}
	}
	return H.consume(ep)
}

H((push, next) => {
	console.log('*** GENERATOR ***', genc++)
	wait(1000)('Waited').then(m => {
		// console.log('*** GENDONE   ***', (genc - 1))
		next()
		push(null, m)
	})
})
.through(eagerPromer(wait(1500))) // decode(x)
.each(m => { console.log(m, process.hrtime(stamp)); stamp = process.hrtime(); })
