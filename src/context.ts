export class Context {

    public offset = 0;

    constructor(public readonly buffer: Buffer) {
        //
    }

    public skipEmpty() {
        while (this.buffer[this.offset] === 0 && this.offset < this.buffer.length) {
            this.offset++;
        }
    }
}