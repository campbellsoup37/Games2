function log(str) {
    console.log(`${new Date().toLocaleString()}:\t${str}`)
}

module.exports = {
    log: log
}
