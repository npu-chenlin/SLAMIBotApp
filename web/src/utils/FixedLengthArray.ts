class FixedLengthArray {
    maxLength: number;
    data: number[];

    constructor(maxLength = 100000) {
        this.maxLength = maxLength;
        this.data = [];
    }

    push(...elements: number[]) {

        this.data.push(...elements);

        if (this.data.length > this.maxLength) {
            const overflow = this.data.length - this.maxLength;
            this.data.splice(0, overflow);
        }
    }

    get array() {
        return [...this.data];
    }

    get length() {
        return this.data.length;
    }

    clear() {
        this.data = [];
    }
}

export default FixedLengthArray;