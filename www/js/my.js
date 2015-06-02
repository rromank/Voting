(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
var BigInteger = require('node-biginteger');
var SecureRandom = require('secure-random');

global.bigIntFromString = function(string) {
	return BigInteger.fromString(string);
}

global.bigIntFromLong = function(long) {
	return BigInteger.fromLong(long);
}

global.bigIntFromMessage = function(message) {
	var bytes = [];
	for (var i = 0; i < message.length; i++)
	{
    	bytes.push(message.charCodeAt(i));
	}
	return BigInteger.fromBuffer(1, bytes);
}

// Blind message by Alice
global.blindMessage = function(message, maskingFactor, e, n) {
	var blindedMessage = ((maskingFactor.modPow(e, n)).multiply(message)).mod(n);
	return blindedMessage;
}

// Sign message by Bob with his private key
global.signMessage = function(blindedMessage, privateKey, n) {
	var blindedSignedMessage = blindedMessage.modPow(privateKey, n);
	return blindedSignedMessage;
}

// Unblind message from server by Alice
global.unblindMessage = function(blindedSignedMessage, maskingFactor, n) {
	var unblindedSignedMessage = maskingFactor.modInverse(n).multiply(blindedSignedMessage).mod(n);
	return unblindedSignedMessage;
}

global.unsignMessage = function(signedMessage, e, n) {
	var unsignedMessage = signedMessage.modPow(e, n);
	return unsignedMessage;
}

global.secureRandomArray = function(length) {
	var data = SecureRandom.randomArray(length);
	return data;
}

global.byteArrayToBigInteger = function(byteArray) {
    var value = 0;
    var string = "";
    for (var i = byteArray.length - 1; i >= 0; i--) {
        value = (value * 256) + byteArray[i];
    }
    return BigInteger.fromNumber(value);
};

global.getMaskingFactor = function(p) {
	var secureRandom = SecureRandom.randomArray(5);
	var maskingFactor;
	do {
		maskingFactor = global.byteArrayToBigInteger(secureRandom);
	} while (gcd(maskingFactor, p) != 1);
	return maskingFactor;
}

global.gcd = function(a, b) {
	var zero = BigInteger.fromNumber(0);
	while (true) {
		a = a.mod(b);
		if (a.compareTo(zero) <= 0) return b;
		b = b.mod(a);
		if (b.compareTo(zero) <= 0) return a;
	}
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"node-biginteger":11,"secure-random":20}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined' && object.buffer instanceof ArrayBuffer) {
    return fromTypedArray(that, object)
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = String(string)

  if (string.length === 0) return 0

  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      return string.length
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return string.length * 2
    case 'hex':
      return string.length >>> 1
    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(string).length
    case 'base64':
      return base64ToBytes(string).length
    default:
      return string.length
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function toString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":4,"ieee754":5,"is-array":6}],4:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],5:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],6:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],7:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],8:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],9:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],10:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":9,"_process":8,"inherits":7}],11:[function(require,module,exports){
module.exports = require('./lib/BigInteger');
},{"./lib/BigInteger":12}],12:[function(require,module,exports){
(function (Buffer){
/**
 * Immutable arbitrary-precision integers.  All operations behave as if
 * BigIntegers were represented in two's-complement notation (like Java's
 * primitive integer types).  BigInteger provides analogues to all of Java's
 * primitive integer operators, and all relevant methods from java.lang.Math.
 * Additionally, BigInteger provides operations for modular arithmetic, GCD
 * calculation, primality testing, prime generation, bit manipulation,
 * and a few other miscellaneous operations.
 *
 * <p>Semantics of arithmetic operations exactly mimic those of Java's integer
 * arithmetic operators, as defined in <i>The Java Language Specification</i>.
 * For example, division by zero throws an {@code ArithmeticException}, and
 * division of a negative by a positive yields a negative (or zero) remainder.
 * All of the details in the Spec concerning overflow are ignored, as
 * BigIntegers are made as large as necessary to accommodate the results of an
 * operation.
 *
 * <p>Semantics of shift operations extend those of Java's shift operators
 * to allow for negative shift distances.  A right-shift with a negative
 * shift distance results in a left shift, and vice-versa.  The unsigned
 * right shift operator ({@code >>>}) is omitted, as this operation makes
 * little sense in combination with the "infinite word size" abstraction
 * provided by this class.
 *
 * <p>Semantics of bitwise logical operations exactly mimic those of Java's
 * bitwise integer operators.  The binary operators ({@code and},
 * {@code or}, {@code xor}) implicitly perform sign extension on the shorter
 * of the two operands prior to performing the operation.
 *
 * <p>Comparison operations perform signed integer comparisons, analogous to
 * those performed by Java's relational and equality operators.
 *
 * <p>Modular arithmetic operations are provided to compute residues, perform
 * exponentiation, and compute multiplicative inverses.  These methods always
 * return a non-negative result, between {@code 0} and {@code (modulus - 1)},
 * inclusive.
 *
 * <p>Bit operations operate on a single bit of the two's-complement
 * representation of their operand.  If necessary, the operand is sign-
 * extended so that it contains the designated bit.  None of the single-bit
 * operations can produce a BigInteger with a different sign from the
 * BigInteger being operated on, as they affect only a single bit, and the
 * "infinite word size" abstraction provided by this class ensures that there
 * are infinitely many "virtual sign bits" preceding each BigInteger.
 *
 * <p>For the sake of brevity and clarity, pseudo-code is used throughout the
 * descriptions of BigInteger methods.  The pseudo-code expression
 * {@code (i + j)} is shorthand for "a BigInteger whose value is
 * that of the BigInteger {@code i} plus that of the BigInteger {@code j}."
 * The pseudo-code expression {@code (i == j)} is shorthand for
 * "{@code true} if and only if the BigInteger {@code i} represents the same
 * value as the BigInteger {@code j}."  Other pseudo-code expressions are
 * interpreted similarly.
 *
 * <p>All methods and constructors in this class throw
 * {@code NullPointerException} when passed
 * a null object reference for any input parameter.
 *
 * @see     BigDecimal
 * @author  Josh Bloch
 * @author  Michael McCloskey
 * @since JDK1.1
 */
var Long = require('long');
var Integer = require('./Integer');
var Common = require('./common');
var MutableBigInteger = require('./MutableBigInteger');
var BigIntegerLib = require('./BigIntegerLib');
var clone = require('clone');

var MIN_RADIX = 2;
var MAX_RADIX = 36;

var bitsPerDigit = [ 0, 0,
  1024, 1624, 2048, 2378, 2648, 2875, 3072, 3247, 3402, 3543, 3672,
  3790, 3899, 4001, 4096, 4186, 4271, 4350, 4426, 4498, 4567, 4633,
  4696, 4756, 4814, 4870, 4923, 4975, 5025, 5074, 5120, 5166, 5210,
  5253, 5295
];

var digitsPerInt = [0, 0, 30, 19, 15, 13, 11,
  11, 10, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5
];
var digitsPerLong = [0, 0,
  62, 39, 31, 27, 24, 22, 20, 19, 18, 18, 17, 17, 16, 16, 15, 15, 15, 14,
  14, 14, 14, 13, 13, 13, 13, 13, 13, 12, 12, 12, 12, 12, 12, 12, 12];

var intRadix = [0, 0,
  0x40000000, 0x4546b3db, 0x40000000, 0x48c27395, 0x159fd800,
  0x75db9c97, 0x40000000, 0x17179149, 0x3b9aca00, 0xcc6db61,
  0x19a10000, 0x309f1021, 0x57f6c100, 0xa2f1b6f,  0x10000000,
  0x18754571, 0x247dbc80, 0x3547667b, 0x4c4b4000, 0x6b5a6e1d,
  0x6c20a40,  0x8d2d931,  0xb640000,  0xe8d4a51,  0x1269ae40,
  0x17179149, 0x1cb91000, 0x23744899, 0x2b73a840, 0x34e63b41,
  0x40000000, 0x4cfa3cc1, 0x5c13d840, 0x6d91b519, 0x39aa400
];

var LONG_MASK = 0xffffffff;
var MAX_CONSTANT = 16;

var longRadix = [null, null,
  Long.fromString('4000000000000000',16), Long.fromString('383d9170b85ff80b',16),
  Long.fromString('4000000000000000',16), Long.fromString('6765c793fa10079d',16),
  Long.fromString('41c21cb8e1000000',16), Long.fromString('3642798750226111',16),
  Long.fromString('1000000000000000',16), Long.fromString('12bf307ae81ffd59',16),
  Long.fromString( 'de0b6b3a7640000',16), Long.fromString('4d28cb56c33fa539',16),
  Long.fromString('1eca170c00000000',16), Long.fromString('780c7372621bd74d',16),
  Long.fromString('1e39a5057d810000',16), Long.fromString('5b27ac993df97701',16),
  Long.fromString('1000000000000000',16), Long.fromString('27b95e997e21d9f1',16),
  Long.fromString('5da0e1e53c5c8000',16), Long.fromString( 'b16a458ef403f19',16),
  Long.fromString('16bcc41e90000000',16), Long.fromString('2d04b7fdd9c0ef49',16),
  Long.fromString('5658597bcaa24000',16), Long.fromString( '6feb266931a75b7',16),
  Long.fromString( 'c29e98000000000',16), Long.fromString('14adf4b7320334b9',16),
  Long.fromString('226ed36478bfa000',16), Long.fromString('383d9170b85ff80b',16),
  Long.fromString('5a3c23e39c000000',16), Long.fromString( '4e900abb53e6b71',16),
  Long.fromString( '7600ec618141000',16), Long.fromString( 'aee5720ee830681',16),
  Long.fromString('1000000000000000',16), Long.fromString('172588ad4f5f0981',16),
  Long.fromString('211e44f7d02c1000',16), Long.fromString('2ee56725f06e5c71',16),
  Long.fromString('41c21cb8e1000000',16)
];

/* zero[i] is a string of i consecutive zeros. */
var zeros = Common.intArray(64);
zeros[63] = "000000000000000000000000000000000000000000000000000000000000000";
for (var i = 0; i < 63; i++)
  zeros[i] = zeros[63].substring(0, i);


function BigInteger() {
  this.signum;
  this.mag;
  this._bitLength = 0;
  this.bitCount = 0;
  this.firstNonzeroIntNum = 0;
  this.lowestSetBit = 0;
}

/**
 * Translates a byte array containing the two's-complement binary
 * representation of a BigInteger into a BigInteger.  The input array is
 * assumed to be in <i>big-endian</i> byte-order: the most significant
 * byte is in the zeroth element.
 *
 * @param  val big-endian two's-complement binary representation of
 *         BigInteger.
 * @throws NumberFormatException {@code val} is zero bytes long.
 */
BigInteger.fromBuffer = function (signum, magnitude) {
  var _bigInteger = new BigInteger();
  _bigInteger.mag = _bigInteger._stripLeadingZeroBytes(magnitude);

  if (signum < -1 || signum > 1)
    throw new Error("Invalid signum value");

  if (_bigInteger.mag.length==0) {
    _bigInteger.signum = 0;
  } else {
    if (signum == 0)
      throw new Error("signum-magnitude mismatch");
    _bigInteger.signum = signum;
  }
  return _bigInteger;
};

BigInteger.fromNumber = function(number) {
  var long = Long.fromNumber(number);
  return BigInteger.fromLong(long);
};

BigInteger.fromLong = function (val) {
  var _bigInteger = new BigInteger();
  if (val.compare(Long.ZERO) < 0) {
    val = val.negate();
    _bigInteger.signum = -1;
  } else {
    _bigInteger.signum = 1;
  }

  if (val.high === 0) {
    _bigInteger.mag = Common.intArray(1);
    _bigInteger.mag[0] = val.low;
  } else {
    _bigInteger.mag = Common.intArray(2);
    _bigInteger.mag[0] = val.high;
    _bigInteger.mag[1] = val.low;
  }
  return _bigInteger;
};

/**
 * Translates the String representation of a BigInteger in the
 * specified radix into a BigInteger.  The String representation
 * consists of an optional minus or plus sign followed by a
 * sequence of one or more digits in the specified radix.  The
 * character-to-digit mapping is provided by {@code
 * Character.digit}.  The String may not contain any extraneous
 * characters (whitespace, for example).
 *
 * @param val String representation of BigInteger.
 * @param radix radix to be used in interpreting {@code val}.
 * @throws NumberFormatException {@code val} is not a valid representation
 *         of a BigInteger in the specified radix, or {@code radix} is
 *         outside the range from {@link Character#MIN_RADIX} to
 *         {@link Character#MAX_RADIX}, inclusive.
 * @see    Character#digit
 */
BigInteger.fromString = function (val, radix) {
  radix = radix || 10;
  var cursor = 0;
  var numDigits;
  var len = val.length;
  if (radix < MIN_RADIX || radix > MAX_RADIX) {
    throw new Error('Radix out of range');
  }
  if (len === 0) {
    throw new Error("Zero length BigInteger");
  }
  var sign = 1;
  var index1 = val.lastIndexOf('-');
  var index2 = val.lastIndexOf('+');
  if ((index1 + index2) <= -1) {
    if (index1 === 0 || index2 === 0) {
      cursor = 1;
      if (len === 1) {
        throw new Error("Zero length BigInteger");
      }
    }
    if (index1 === 0) {
      sign = -1;
    }
  } else {
    throw new Error("Illegal embedded sign character");
  }
  var _bigInteger = new BigInteger();
  /*跳过前导的0，如果全部是0，直接储存ZERO.mag*/
  // Skip leading zeros and compute number of digits in magnitude
  while (cursor < len && parseInt(val.substring(cursor + 1, 1), radix) === 0) {
    cursor++;
  }
  if (cursor === len) {
    // _bigInteger.signum = 0;
    // _bigInteger.mag = new Buffer([0]);
    return ZERO;
  }
  numDigits = len - cursor;
  _bigInteger.signum = sign;
  // Pre-allocate array of expected size. May be too large but can
  // never be too small. Typically exact.
  var numBits = parseInt(((numDigits * bitsPerDigit[radix]) >>> 10) + 1, 10);
  var numWords = (numBits + 31) >>> 5;
  // 存储转换后的数字
  var magnitude = Common.intArray(numWords);
  // for (var i = 0; i < numWords; i++)
    // magnitude[i] = 0;

  var firstGroupLen = numDigits % digitsPerInt[radix];
  if (firstGroupLen === 0)
    firstGroupLen = digitsPerInt[radix];

  var group = val.substring(cursor, cursor += firstGroupLen);
  
  magnitude[numWords - 1] = parseInt(group, radix);
  if (magnitude[numWords - 1] < 0)
    throw new Error("Illegal digit");

  // Process remaining digit groups
  var superRadix = intRadix[radix];
  var groupVal = 0;
  while (cursor < len) {
      group = val.substring(cursor, cursor += digitsPerInt[radix]);
      groupVal = parseInt(group, radix);

      if (groupVal < 0)
          throw new Error("Illegal digit");
      _bigInteger._destructiveMulAdd(magnitude, superRadix, groupVal);
  }
  
  _bigInteger.mag = trustedStripLeadingZeroInts(magnitude);
  return _bigInteger;
};

/**
 * Returns a copy of the input array stripped of any leading zero bytes.
 */
BigInteger.prototype._stripLeadingZeroBytes = function (a) {
  var byteLength = a.length;
  var keep;

  // Find first nonzero byte
  for (keep = 0; keep < byteLength && a[keep] === 0; keep++)
      ;

  // Allocate new array and copy relevant part of input array
  var intLength = ((byteLength - keep) + 3) >>> 2;
  var result = Common.intArray(intLength);
  var b = byteLength - 1;
  for (var i = intLength-1; i >= 0; i--) {
    result[i] = a[b--] & 0xff;
    var bytesRemaining = b - keep + 1;
    var bytesToTransfer = Math.min(3, bytesRemaining);
    for (var j=8; j <= (bytesToTransfer << 3); j += 8)
      result[i] |= ((a[b--] & 0xff) << j);
  }
  return result;
}

// Multiply x array times word y in place, and add word z
BigInteger.prototype._destructiveMulAdd = function (x, y, z) {
  // Perform the multiplication word by word
  var ylong = Long.fromNumber(y >>> 32);
  var zlong = z >>> 32;
  var len = x.length;
  var product = Long.ZERO;
  var carry = 0;
  for (var i = len-1; i >= 0; i--) {
    
    product = ylong.multiply( Long.fromNumber(x[i] >>> 32) ).add(Long.fromInt(carry));
    x[i] = product.low;
    carry = product.high;
  }
  // Perform the addition
  var sum = (x[len - 1] >>> 32) + zlong;
  sum = Long.fromNumber(sum);
  x[len-1] = sum.low;
  carry = sum.high;
  for (var i = len - 2 ; i >= 0; i--) {
    sum = Long.fromNumber((x[i] >>> 32) + carry);
    x[i] = sum.low;
    carry = sum.high;
  }

};

function trustedStripLeadingZeroInts(val) {
  var vlen = val.length;
  var keep;
  // Find first nonzero byte
  for (keep = 0; keep < vlen && val[keep] == 0; keep++)
      ;
  return keep == 0 ? val : Common.copyOfRange(val, keep, vlen);
};

/**
 * Returns the number of bits in the minimal two's-complement
 * representation of this BigInteger, <i>excluding</i> a sign bit.
 * For positive BigIntegers, this is equivalent to the number of bits in
 * the ordinary binary representation.  (Computes
 * {@code (ceil(log2(this < 0 ? -this : this+1)))}.)
 *
 * @return number of bits in the minimal two's-complement
 *         representation of this BigInteger, <i>excluding</i> a sign bit.
 */
BigInteger.prototype.bitLength = function () {
  var n = this._bitLength - 1;
  if (n == -1) { // bitLength not initialized yet
    var m = this.mag;
    var len = m.length;
    if (len == 0) {
      n = 0; // offset by one to initialize
    }  else {
      // Calculate the bit length of the magnitude
      var magBitLength = ((len - 1) << 5) + BigIntegerLib.bitLengthForInt(this.mag[0]);
       if (this.signum < 0) {
           // Check if magnitude is a power of two
           var pow2 = (Integer.bitCount(this.mag[0]) == 1);
           for(var i=1; i< len && pow2; i++)
               pow2 = (this.mag[i] == 0);

           n = (pow2 ? magBitLength -1 : magBitLength);
       } else {
           n = magBitLength;
       }
    }
    bitLength = n + 1;
  }
  return n;
}

/**
 * Returns a byte array containing the two's-complement
 * representation of this BigInteger.  The byte array will be in
 * <i>big-endian</i> byte-order: the most significant byte is in
 * the zeroth element.  The array will contain the minimum number
 * of bytes required to represent this BigInteger, including at
 * least one sign bit, which is {@code (ceil((this.bitLength() +
 * 1)/8))}.  (This representation is compatible with the
 * {@link #BigInteger(byte[]) (byte[])} constructor.)
 *
 * @return a byte array containing the two's-complement representation of
 *         this BigInteger.
 * @see    #BigInteger(byte[])
 */
BigInteger.prototype.toBuffer = function () {
  var byteLen = parseInt(this.bitLength() / 8, 10) + 1;
  var byteArray = new Buffer(byteLen);
  byteArray.fill(0xff);

  for (var i = byteLen - 1, bytesCopied = 4, nextInt = 0, intIndex = 0; i >= 0; i--) {
    if (bytesCopied == 4) {
        nextInt = this._getInt(intIndex++);
        bytesCopied = 1;
    } else {
        nextInt >>>= 8;
        bytesCopied++;
    }
    byteArray[i] = nextInt;
  }
  return byteArray;
}

/**
 * Returns a BigInteger whose value is the absolute value of this
 * BigInteger.
 *
 * @return {@code abs(this)}
 */
BigInteger.prototype.abs = function () {
  return this.signum >= 0 ? this : this.negate();
};

/**
 * Returns a BigInteger whose value is {@code (-this)}.
 *
 * @return {@code -this}
 */
BigInteger.prototype.negate = function () {
  return BigInteger.fromMag(this.mag, -this.signum);
};

/**
* Returns a copy of the input array stripped of any leading zero bytes.
*/
function stripLeadingZeroInts(val) {
  var vlen = val.length;
  var keep;
  // Find first nonzero byte
  for (keep = 0; keep < vlen && val[keep] == 0; keep++)
      ;
  return Common.copyOfRange(val, keep, vlen);
}

function _fromMag(signum, magnitude) {
  var _bigInteger = new BigInteger();
  _bigInteger.mag = stripLeadingZeroInts(magnitude);

  if (signum < -1 || signum > 1)
      throw(new Error("Invalid signum value"));

  if (_bigInteger.mag.length==0) {
      _bigInteger.signum = 0;
  } else {
      if (signum == 0)
          throw(new Error("signum-magnitude mismatch"));
      _bigInteger.signum = signum;
  }
  return _bigInteger;
};

BigInteger.fromMag = function (magnitude, signum) {
  
  var _bigInteger = new BigInteger();

  if (typeof signum === 'undefined') {
    // @see BigInteger(int[] val) 
    if (magnitude.length == 0)
      throw new Error("Zero length BigInteger");

    if (magnitude[0] < 0) {
      _bigInteger.mag = makePositive();
      _bigInteger.signum = -1;
    } else {
      _bigInteger.mag = trustedStripLeadingZeroInts(magnitude);
      _bigInteger.signum = _bigInteger.length === 0 ? 0 : 1
    }

  } else {
    // @see BigInteger(int[] magnitude, int signum)    
    _bigInteger.signum = (magnitude.length === 0 ? 0 : signum);
    _bigInteger.mag = magnitude;
    
  }

  return _bigInteger;  
  
};

/* Returns an int of sign bits */
BigInteger.prototype._signInt = function () {
  return this.signum < 0 ? -1 : 0;
}

/**
 * Returns the index of the int that contains the first nonzero int in the
 * little-endian binary representation of the magnitude (int 0 is the
 * least significant). If the magnitude is zero, return value is undefined.
 */
BigInteger.prototype._firstNonzeroIntNum = function () {
 var fn = this.firstNonzeroIntNum - 2;
 if (fn == -2) { // firstNonzeroIntNum not initialized yet
   fn = 0;

   // Search for the first nonzero int
   var i;
   var mlen = this.mag.length;
   for (i = mlen - 1; i >= 0 && this.mag[i] == 0; i--)
       ;
   fn = mlen - i - 1;
   this.firstNonzeroIntNum = fn + 2; // offset by two to initialize
 }
 return fn;
}

/**
 * Returns the specified int of the little-endian two's complement
 * representation (int 0 is the least significant).  The int number can
 * be arbitrarily high (values are logically preceded by infinitely many
 * sign ints).
 */
BigInteger.prototype._getInt = function (n) {
  if (n < 0)
    return 0;
  if (n >= this.mag.length)
    return this._signInt();

  var magInt = this.mag[this.mag.length - n - 1];

  return (this.signum >= 0 ? magInt : (n <= this._firstNonzeroIntNum() ? -magInt : ~magInt));
}

/**
 * Right shift this MutableBigInteger n bits, where n is
 * less than 32.
 * Assumes that intLen > 0, n > 0 for speed
 */
function primitiveRightShift(n) {
  // int[]
  var val = this.value;
  var n2 = 32 - n;
  for (var i = offset + intLen - 1, c = val[i]; i > offset; i--) {
    var b = c;
    c = val[i - 1];
    val[i] = (c << n2) | (b >>> n);
  }
  val[offset] >>>= n;
}

/**
 * Converts this BigInteger to a {@code long}.  This
 * conversion is analogous to a
 * <i>narrowing primitive conversion</i> from {@code long} to
 * {@code int} as defined in section 5.1.3 of
 * <cite>The Java&trade; Language Specification</cite>:
 * if this BigInteger is too big to fit in a
 * {@code long}, only the low-order 64 bits are returned.
 * Note that this conversion can lose information about the
 * overall magnitude of the BigInteger value as well as return a
 * result with the opposite sign.
 *
 * @return this BigInteger converted to a {@code long}.
 */
BigInteger.prototype.longValue = function () {
  var result = Long.ZERO;
  for (var i = 1; i >= 0; i--) {
    result = result.shiftLeft(32).add(Long.fromNumber(this._getInt(i) >>> 32));
  }
  return result;
  // return new Long(this._getInt(0), this._getInt(1), false); 
}

BigInteger.fromMutableBigInteger = function (mb, sign) {
  if (mb.intLen === 0 || sign === 0) {
    return ZERO;
  }
  return BigInteger.fromMag(mb.getMagnitudeArray(), sign);
}

BigInteger.prototype.toString = function (radix) {
  if (!radix) {
    radix = 10;
  }

  if (this.signum == 0)
    return "0";
  if (radix < MIN_RADIX || radix > MAX_RADIX)
    radix = 10;

  // Compute upper bound on number of digit groups and allocate space
  var maxNumDigitGroups = parseInt((4 * this.mag.length + 6) / 7);
  // String
  var digitGroup = Common.intArray(maxNumDigitGroups);
  // var MutableBigInteger = require('./MutableBigInteger');
  // Translate number to string, a digit group at a time
  var tmp = this.abs();
  var numGroups = 0;
  while (tmp.signum != 0) {
    var d = BigInteger.fromLong(longRadix[radix]);
    var q = new MutableBigInteger();
    var a = new MutableBigInteger(tmp.mag);
    var b = new MutableBigInteger(d.mag);
    var r = a.divide(b, q);
    var q2 = BigInteger.fromMutableBigInteger(q, tmp.signum * d.signum);
    var r2 = BigInteger.fromMutableBigInteger(r, tmp.signum * d.signum);
    digitGroup[numGroups++] = Common.longString(r2.longValue(), radix);
    tmp = q2;
  }

  // Put sign (if any) and first digit group into result buffer
  // var buf = new StringBuilder(numGroups*digitsPerLong[radix]+1);
  var buf = [];
  if (this.signum < 0)
    buf.push('-');
  buf.push(digitGroup[numGroups-1]);

  // Append remaining digit groups padded with leading zeros
  for (var i = numGroups - 2; i >= 0; i--) {
    // Prepend (any) leading zeros for this digit group
    var numLeadingZeros = digitsPerLong[radix]-digitGroup[i].length;
    if (numLeadingZeros != 0)
        buf.push(zeros[numLeadingZeros]);
    buf.push(digitGroup[i]);
  }
  
  return buf.join('');
}

/**
 * Adds the contents of the int arrays x and y. This method allocates
 * a new int array to hold the answer and returns a reference to that
 * array.
 */
function add(x, y) {
  // If x is shorter, swap the two arrays
  if (x.length < y.length) {
    var tmp = x;
    x = y;
    y = tmp;
  }

  var xIndex = x.length;
  var yIndex = y.length;
  var result = Common.intArray(xIndex);
  // long
  var sum = Long.ZERO;

  // Add common parts of both numbers
  while(yIndex > 0) {
    // sum = (x[--xIndex] & LONG_MASK) + (y[--yIndex] & LONG_MASK) + (sum >>> 32);
    sum = Long.fromNumber(x[--xIndex] >>> 32).add(Long.fromNumber(y[--yIndex] >>> 32)).add(sum.shiftRight(32));
    // result[xIndex] = (int)sum;
    result[xIndex] = sum.low;
  }

  // Copy remainder of longer number while carry propagation is required
  var carry = (sum.shiftRight(32).toNumber() != 0);
  while (xIndex > 0 && carry)
    carry = ((result[--xIndex] = x[xIndex] + 1) == 0);

  // Copy remainder of longer number
  while (xIndex > 0)
    result[--xIndex] = x[xIndex];

  // Grow result if necessary
  if (carry) {
    var bigger = Common.intArray(result.length + 1);
    Common.arraycopy(result, 0, bigger, 1, result.length);
    bigger[0] = 0x01;
    return bigger;
  }
  return result;
}

/**  
 * Subtracts the contents of the second int arrays (little) from the
 * first (big).  The first int array (big) must represent a larger number
 * than the second.  This method allocates the space necessary to hold the
 * answer.
 */
function subtract(big, little) {
  var bigIndex = big.length;
  var result = Common.intArray(bigIndex);
  var littleIndex = little.length;
  // long
  var difference = Long.ZERO;

  // Subtract common parts of both numbers
  while(littleIndex > 0) {
    difference = Long.fromNumber(big[--bigIndex] >>> 32).subtract(Long.fromNumber(little[--littleIndex] >>> 32)).add(difference.shiftRight(32));
    result[bigIndex] = difference.low;
  }

  // Subtract remainder of longer number while borrow propagates
  var borrow = (difference.shiftRight(32).toNumber() != 0);
  while (bigIndex > 0 && borrow)
    borrow = ((result[--bigIndex] = big[bigIndex] - 1) == -1);

  // Copy remainder of longer number
  while (bigIndex > 0)
    result[--bigIndex] = big[bigIndex];

  return result;
}

/**
 * Returns a BigInteger whose value is {@code (this + val)}.
 *
 * @param  val value to be added to this BigInteger.
 * @return {@code this + val}
 */
BigInteger.prototype.add = function (val) {
  if (val.signum === 0)
    return this;
  if (this.signum === 0)
    return val;
  if (val.signum === this.signum)
    return BigInteger.fromMag(add(this.mag, val.mag), this.signum);

  var cmp = this.compareMagnitude(val);
  if (cmp == 0)
    return ZERO;
  var resultMag = (cmp > 0 ? subtract(this.mag, val.mag) : subtract(val.mag, this.mag));
  resultMag = trustedStripLeadingZeroInts(resultMag);

  return BigInteger.fromMag(resultMag, cmp === this.signum ? 1 : -1);
}


/**
 * Returns a BigInteger whose value is {@code (this - val)}.
 *
 * @param  val value to be subtracted from this BigInteger.
 * @return {@code this - val}
 */
BigInteger.prototype.subtract = function (val) {
  if (val.signum == 0)
    return this;
  if (this.signum == 0)
    return val.negate();
  if (val.signum != this.signum)
    return BigInteger.fromMag(add(this.mag, val.mag), this.signum);

  var cmp = this.compareMagnitude(val);
  if (cmp == 0)
    return ZERO;
  var resultMag = (cmp > 0 ? subtract(this.mag, val.mag) : subtract(val.mag, this.mag));
  resultMag = trustedStripLeadingZeroInts(resultMag);
  return BigInteger.fromMag(resultMag, cmp == this.signum ? 1 : -1);
}

/**
 * Compares the magnitude array of this BigInteger with the specified
 * BigInteger's. This is the version of compareTo ignoring sign.
 *
 * @param val BigInteger whose magnitude array to be compared.
 * @return -1, 0 or 1 as this magnitude array is less than, equal to or
 *         greater than the magnitude aray for the specified BigInteger's.
 */
BigInteger.prototype.compareMagnitude = function (val) {
  var m1 = this.mag;
  var len1 = m1.length;
  var m2 = val.mag;
  var len2 = m2.length;
  if (len1 < len2)
    return -1;
  if (len1 > len2)
    return 1;
  for (var i = 0; i < len1; i++) {
    var a = m1[i];
    var b = m2[i];
    if (a != b)
      return ((a >>> 32) < (b >>> 32)) ? -1 : 1;
  }
  return 0;
}

/**
 * Multiplies int arrays x and y to the specified lengths and places
 * the result into z. There will be no leading zeros in the resultant array.
 */
function multiplyToLen(x, xlen, y, ylen, z) {
  var xstart = xlen - 1;
  var ystart = ylen - 1;

  if (z == null || z.length < (xlen+ ylen))
    z = Common.intArray(xlen+ylen);

  var carry = Long.ZERO;
  for (var j = ystart, k = ystart + 1 + xstart; j >= 0; j--, k--) {
    var product = Long.fromNumber(y[j] >>> 32).multiply(Long.fromNumber(x[xstart] >>> 32)).add(carry);
    z[k] = product.low;
    carry = product.shiftRightUnsigned(32);
  }
  z[xstart] = carry.low;

  for (var i = xstart-1; i >= 0; i--) {
    carry = Long.ZERO;
    for (var j = ystart, k = ystart + 1 + i; j >= 0; j--, k--) {
        var product = Long.fromNumber(y[j] >>> 32).multiply(Long.fromNumber(x[i] >>> 32)).add(Long.fromNumber(z[k] >>> 32)).add(carry);
        z[k] = product.low;
        carry = product.shiftRightUnsigned(32);
    }
    z[i] = carry.low;
  }
  return z;
}

/**
 * Returns a BigInteger whose value is {@code (this * val)}.
 *
 * @param  val value to be multiplied by this BigInteger.
 * @return {@code this * val}
 */
BigInteger.prototype.multiply = function (val) {
  if (val.signum == 0 || this.signum == 0)
    return ZERO;
  var result = multiplyToLen(this.mag, this.mag.length, val.mag, val.mag.length, null);
  result = trustedStripLeadingZeroInts(result);
  var x = BigInteger.fromMag(result, this.signum == val.signum ? 1 : -1);
  return x;
}

/**
 * Returns the length of the two's complement representation in ints,
 * including space for at least one sign bit.
 */
BigInteger.prototype.intLength = function () {
  return (this.bitLength() >>> 5) + 1;
}

/**
 * Returns a BigInteger with the given two's complement representation.
 * Assumes that the input array will not be modified (the returned
 * BigInteger will reference the input array if feasible).
 */
function valueOf(val) {
  return (val[0] > 0 ? BigInteger.fromMag(val, 1) : BigInteger.fromMag(val));
}

// long val
BigInteger.valueOf = function (val) {
  // If -MAX_CONSTANT < val < MAX_CONSTANT, return stashed constant
  if (val.toNumber() === 0)
    return ZERO;
  if (val.toNumber() > 0 && val.toNumber() <= MAX_CONSTANT)
      return posConst[val.low];
  else if (val.toNumber() < 0 && val.toNumber() >= -MAX_CONSTANT)
      return negConst[val.negate().low];

  return BigInteger.fromLong(val);
}

/**
 * Takes an array a representing a negative 2's-complement number and
 * returns the minimal (no leading zero ints) unsigned whose value is -a.
 * @param {int[]} a
 */
function makePositive(a) {
    var keep, j;

    // Find first non-sign (0xffffffff) int of input
    for (keep = 0; keep < a.length && a[keep] === -1; keep++)
        ;

    /* Allocate output array.  If all non-sign ints are 0x00, we must
     * allocate space for one extra output int. */
    for (j = keep; j < a.length && a[j] === 0; j++)
        ;
    var extraInt = (j === a.length ? 1 : 0);
    var result = Common.intArray(a.length - keep + extraInt);

    /* Copy one's complement of input into output, leaving extra
     * int (if it exists) == 0x00 */
    for (var i = keep; i < a.length; i++)
        result[i - keep + extraInt] = ~a[i];

    // Add one to one's complement to generate two's complement
    for (var i = result.length - 1; ++result[i] === 0; i--)
        ;

    return result;
}

/**
 * Returns a BigInteger whose value is {@code (this & val)}.  (This
 * method returns a negative BigInteger if and only if this and val are
 * both negative.)
 *
 * @param val value to be AND'ed with this BigInteger.
 * @return {@code this & val}
 */
BigInteger.prototype.and = function (val) {
  var result = Common.intArray(Math.max(this.intLength(), val.intLength()));
  for (var i = 0; i < result.length; i++)
    result[i] = (this._getInt(result.length-i-1) & val._getInt(result.length-i-1));
  return valueOf(result);
}

/**
* Squares the contents of the int array x. The result is placed into the
* int array z.  The contents of x are not changed.
*/
var squareToLen = BigInteger.squareToLen = function (x, len, z) {
  /*
   * The algorithm used here is adapted from Colin Plumb's C library.
   * Technique: Consider the partial products in the multiplication
   * of "abcde" by itself:
   *
   *               a  b  c  d  e
   *            *  a  b  c  d  e
   *          ==================
   *              ae be ce de ee
   *           ad bd cd dd de
   *        ac bc cc cd ce
   *     ab bb bc bd be
   *  aa ab ac ad ae
   *
   * Note that everything above the main diagonal:
   *              ae be ce de = (abcd) * e
   *           ad bd cd       = (abc) * d
   *        ac bc             = (ab) * c
   *     ab                   = (a) * b
   *
   * is a copy of everything below the main diagonal:
   *                       de
   *                 cd ce
   *           bc bd be
   *     ab ac ad ae
   *
   * Thus, the sum is 2 * (off the diagonal) + diagonal.
   *
   * This is accumulated beginning with the diagonal (which
   * consist of the squares of the digits of the input), which is then
   * divided by two, the off-diagonal added, and multiplied by two
   * again.  The low bit is simply a copy of the low bit of the
   * input, so it doesn't need special care.
   */
  var zlen = len << 1;
  if (z == null || z.length < zlen)
    z = Common.intArray(zlen);

  // Store the squares, right shifted one bit (i.e., divided by 2)
  var lastProductLowWord = 0;
  for (var j=0, i=0; j<len; j++) {
    var piece = Long.fromNumber(x[j] >>> 32);
    var product = piece.multiply(piece);
    z[i++] = (lastProductLowWord << 31) | product.shiftRightUnsigned(33).low;
    z[i++] = product.shiftRightUnsigned(1).low;
    lastProductLowWord = product.low;
  }

  // Add in off-diagonal sums
  for (var i = len, offset = 1; i > 0; i--, offset += 2) {
    var t = x[i-1];
    t = mulAdd(z, x, offset, i-1, t);
    addOne(z, offset-1, i, t);
  }

  // Shift back up and set low bit
  primitiveLeftShift(z, zlen, 1);
  z[zlen-1] |= x[len-1] & 1;

  return z;
}

/**
 * Multiply an array by one word k and add to result, return the carry
 * int[] out, int[] in, int offset, int len, int k
 */
function mulAdd(out, _in, offset, len, k) {
  var kLong = Long.fromNumber(k >>> 32);
  var carry = Long.fromNumber(0);

  offset = out.length - offset - 1;
  for (var j = len - 1; j >= 0; j--) {
    var product = Long.fromNumber(_in[j] >>> 32).multiply(kLong).add(Long.fromNumber(out[offset] >>> 32)).add(carry);
    out[offset--] = product.low;
    carry = product.shiftRightUnsigned(32);
  }
  return carry.low;
}

/**
 * Add one word to the number a mlen words into a. Return the resulting
 * carry.
 * int[] a, int offset, int mlen, int carry
 */
function addOne(a, offset, mlen, carry) {
  offset = a.length - 1 - mlen - offset;
  var t = Long.fromNumber(a[offset] >>> 32).add(Long.fromNumber(carry >>> 32));

  a[offset] = t.low;
  if (t.shiftRightUnsigned(32).toNumber() === 0)
    return 0;
  while (--mlen >= 0) {
    if (--offset < 0) { // Carry out of number
      return 1;
    } else {
      a[offset]++;
      if (a[offset] != 0)
        return 0;
    }
  }
  return 1;
}

// shifts a up to len left n bits assumes no leading zeros, 0<=n<32
function primitiveLeftShift(a, len, n) {
  if (len === 0 || n === 0)
    return;
  var n2 = 32 - n;
  for (var i=0, c=a[i], m=i+len-1; i<m; i++) {
      var b = c;
      c = a[i+1];
      a[i] = (b << n) | (c >>> n2);
  }
  a[len-1] <<= n;
}


/**
 * Returns a BigInteger whose value is <tt>(this<sup>exponent</sup>)</tt>.
 * Note that {@code exponent} is an integer rather than a BigInteger.
 *
 * @param  exponent exponent to which this BigInteger is to be raised.
 * @return <tt>this<sup>exponent</sup></tt>
 * @throws ArithmeticException {@code exponent} is negative.  (This would
 *         cause the operation to yield a non-integer value.)
 */
BigInteger.prototype.pow = function (exponent) {
  if (exponent < 0)
    throw new Error("Negative exponent");
  if (this.signum === 0)
    return (exponent === 0 ? ONE : this);

  // Perform exponentiation using repeated squaring trick
  var newSign = (this.signum < 0 && (exponent & 1) === 1 ? -1 : 1);
  var baseToPow2 = this.mag;
  var result = [1];

  while (exponent != 0) {
    if ((exponent & 1)==1) {
      result = multiplyToLen(result, result.length, baseToPow2, baseToPow2.length, null);
      result = trustedStripLeadingZeroInts(result);
    }
    if ((exponent >>>= 1) != 0) {
      baseToPow2 = squareToLen(baseToPow2, baseToPow2.length, null);
      baseToPow2 = trustedStripLeadingZeroInts(baseToPow2);
    }
  }
  return BigInteger.fromMag(result, newSign);
}

/**
 * Returns a BigInteger whose value is {@code (this | val)}.  (This method
 * returns a negative BigInteger if and only if either this or val is
 * negative.)
 *
 * @param val value to be OR'ed with this BigInteger.
 * @return {@code this | val}
 */
BigInteger.prototype.or = function (val) {
  var result = Common.intArray(Math.max(this.intLength(), val.intLength()));
  for (var i = 0; i < result.length; i++)
    result[i] = (this._getInt(result.length-i-1) | val._getInt(result.length-i-1));

  return valueOf(result);
}


/**
 * Returns a BigInteger whose value is {@code (this ^ val)}.  (This method
 * returns a negative BigInteger if and only if exactly one of this and
 * val are negative.)
 *
 * @param val value to be XOR'ed with this BigInteger.
 * @return {@code this ^ val}
 */
BigInteger.prototype.xor = function (val) {
    var result = Common.intArray(Math.max(this.intLength(), val.intLength()));
    for (var i=0; i<result.length; i++)
      result[i] = (this._getInt(result.length-i-1) ^ val._getInt(result.length-i-1));

    return valueOf(result);
}

/**
 * Returns a BigInteger whose value is {@code (this & ~val)}.  This
 * method, which is equivalent to {@code and(val.not())}, is provided as
 * a convenience for masking operations.  (This method returns a negative
 * BigInteger if and only if {@code this} is negative and {@code val} is
 * positive.)
 *
 * @param val value to be complemented and AND'ed with this BigInteger.
 * @return {@code this & ~val}
 */
BigInteger.prototype.andNot = function (val) {
  var result = Common.intArray(Math.max(this.intLength(), val.intLength()));
  for (var i=0; i<result.length; i++)
    result[i] = (this._getInt(result.length-i-1) & ~val._getInt(result.length-i-1));

  return valueOf(result);
}

/**
 * Returns a BigInteger whose value is {@code (~this)}.  (This method
 * returns a negative value if and only if this BigInteger is
 * non-negative.)
 *
 * @return {@code ~this}
 */
BigInteger.prototype.not = function () {
  var result = Common.intArray(this.intLength());
  for (var i=0; i<result.length; i++)
    result[i] = ~this._getInt(result.length-i-1);

  return valueOf(result);
}

/**
 * Returns the number of bits in the two's complement representation
 * of this BigInteger that differ from its sign bit.  This method is
 * useful when implementing bit-vector style sets atop BigIntegers.
 *
 * @return number of bits in the two's complement representation
 *         of this BigInteger that differ from its sign bit.
 */ 
BigInteger.prototype.bitCount = function () {
  var bc = this.bitCount - 1;
  if (bc === -1) {  // bitCount not initialized yet
    bc = 0;      // offset by one to initialize
    // Count the bits in the magnitude
    for (var i = 0; i< this.mag.length; i++)
      bc += Integer.bitCount(this.mag[i]);
    if (this.signum < 0) {
      // Count the trailing zeros in the magnitude
      var magTrailingZeroCount = 0, j;
      for (j = this.mag.length-1; this.mag[j]==0; j--)
          magTrailingZeroCount += 32;
      magTrailingZeroCount += Integer.numberOfTrailingZeros(this.mag[j]);
      bc += magTrailingZeroCount - 1;
    }
    this.bitCount = bc + 1;
  }
  return bc;
}

/**
 * Returns a BigInteger whose value is equivalent to this BigInteger
 * with the designated bit cleared.
 * (Computes {@code (this & ~(1<<n))}.)
 *
 * @param  n index of bit to clear.
 * @return {@code this & ~(1<<n)}
 * @throws ArithmeticException {@code n} is negative.
 */
BigInteger.prototype.clearBit = function (n) {
  if (n<0)
    throw new Error("Negative bit address");

  var intNum = n >>> 5;
  var result = Common.intArray(Math.max(this.intLength(), ((n + 1) >>> 5) + 1));

  for (var i = 0; i < result.length; i++)
    result[result.length-i-1] = this._getInt(i);

  result[result.length-intNum-1] &= ~(1 << (n & 31));

  return valueOf(result);
}

/**
 * Returns a BigInteger whose value is {@code (this << n)}.
 * The shift distance, {@code n}, may be negative, in which case
 * this method performs a right shift.
 * (Computes <tt>floor(this * 2<sup>n</sup>)</tt>.)
 *
 * @param  n shift distance, in bits.
 * @return {@code this << n}
 * @throws ArithmeticException if the shift distance is {@code
 *         Integer.MIN_VALUE}.
 * @see #shiftRight
 */
BigInteger.prototype.shiftLeft = function (n) {
  if (this.signum == 0)
    return ZERO;
  if (n==0)
    return this;
  if (n<0) {
    if (n == Integer.MIN_VALUE) {
        throw new Error("Shift distance of Integer.MIN_VALUE not supported.");
    } else {
        return this.shiftRight(-n);
    }
  }

  var nInts = n >>> 5;
  var nBits = n & 0x1f;
  var magLen = this.mag.length;
  var newMag = null;

  if (nBits == 0) {
    newMag = Common.intArray(magLen + nInts);
    for (var i=0; i<magLen; i++)
      newMag[i] = this.mag[i];
  } else {
      var i = 0;
      var nBits2 = 32 - nBits;
      var highBits = this.mag[0] >>> nBits2;
      if (highBits != 0) {
          newMag = Common.intArray(magLen + nInts + 1);
          newMag[i++] = highBits;
      } else {
          newMag = Common.intArray(magLen + nInts);
      }
      var j=0;
      while (j < magLen-1)
          newMag[i++] = this.mag[j++] << nBits | this.mag[j] >>> nBits2;
      newMag[i] = this.mag[j] << nBits;
  }

  return BigInteger.fromMag(newMag, this.signum);
}

/**
 * Returns a BigInteger whose value is {@code (this >> n)}.  Sign
 * extension is performed.  The shift distance, {@code n}, may be
 * negative, in which case this method performs a left shift.
 * (Computes <tt>floor(this / 2<sup>n</sup>)</tt>.)
 *
 * @param  n shift distance, in bits.
 * @return {@code this >> n}
 * @throws ArithmeticException if the shift distance is {@code
 *         Integer.MIN_VALUE}.
 * @see #shiftLeft
 */
BigInteger.prototype.shiftRight = function (n) {
    if (n==0)
      return this;
    if (n<0) {
      if (n == Integer.MIN_VALUE) {
          throw new Error("Shift distance of Integer.MIN_VALUE not supported.");
      } else {
          return this.shiftLeft(-n);
      }
    }

    var nInts = n >>> 5;
    var nBits = n & 0x1f;
    var magLen = this.mag.length;
    var newMag = null;

    // Special case: entire contents shifted off the end
    if (nInts >= magLen)
        return (this.signum >= 0 ? ZERO : negConst[1]);

    if (nBits == 0) {
        var newMagLen = magLen - nInts;
        newMag = Common.intArray(newMagLen);
        for (var i=0; i<newMagLen; i++)
            newMag[i] = this.mag[i];
    } else {
        var i = 0;
        var highBits = this.mag[0] >>> nBits;
        if (highBits != 0) {
            newMag = Common.intArray(magLen - nInts);
            newMag[i++] = highBits;
        } else {
            newMag = Common.intArray(magLen - nInts -1);
        }

        var nBits2 = 32 - nBits;
        var j=0;
        while (j < magLen - nInts - 1)
            newMag[i++] = (this.mag[j++] << nBits2) | (this.mag[j] >>> nBits);
    }

    if (this.signum < 0) {
        // Find out whether any one-bits were shifted off the end.
        var onesLost = false;
        for (var i=magLen-1, j=magLen-nInts; i>=j && !onesLost; i--)
            onesLost = (this.mag[i] != 0);
        if (!onesLost && nBits != 0)
            onesLost = (this.mag[magLen - nInts - 1] << (32 - nBits) != 0);

        if (onesLost)
            newMag = javaIncrement(newMag);
    }

    return BigInteger.fromMag(newMag, this.signum);
}

function javaIncrement(val) {
  var lastSum = 0;
  for (var i=val.length-1;  i >= 0 && lastSum == 0; i--)
      lastSum = (val[i] += 1);
  if (lastSum == 0) {
      val = Common.intArray(val.length+1);
      val[0] = 1;
  }
  return val;
}

/**
 * Compares this BigInteger with the specified BigInteger.  This
 * method is provided in preference to individual methods for each
 * of the six boolean comparison operators ({@literal <}, ==,
 * {@literal >}, {@literal >=}, !=, {@literal <=}).  The suggested
 * idiom for performing these comparisons is: {@code
 * (x.compareTo(y)} &lt;<i>op</i>&gt; {@code 0)}, where
 * &lt;<i>op</i>&gt; is one of the six comparison operators.
 *
 * @param  val BigInteger to which this BigInteger is to be compared.
 * @return -1, 0 or 1 as this BigInteger is numerically less than, equal
 *         to, or greater than {@code val}.
 */
BigInteger.prototype.compareTo = function (val) {
  if (this.signum == val.signum) {
    switch (this.signum) {
    case 1:
      return this.compareMagnitude(val);
    case -1:
      return val.compareMagnitude(this);
    default:
      return 0;
    }
  }
  return this.signum > val.signum ? 1 : -1;
}

/**
 * Compares this BigInteger with the specified Object for equality.
 *
 * @param  x Object to which this BigInteger is to be compared.
 * @return {@code true} if and only if the specified Object is a
 *         BigInteger whose value is numerically equal to this BigInteger.
 */
BigInteger.prototype.equals = function (x) {
  // This test is just an optimization, which may or may not help
  // if (x === this)
  //   return true;

  if (x.constructor.name !== 'BigInteger')
    return false;

  var xInt = x;
  if (xInt.signum != this.signum)
      return false;

  var m = this.mag;
  var len = m.length;
  var xm = xInt.mag;
  if (len != xm.length)
    return false;

  for (var i = 0; i < len; i++){
    if (xm[i] != m[i]) {
      return false;
    }
  }

  return true;
}

/**
  * Returns a BigInteger whose value is {@code (this / val)}.
  *
  * @param  val value by which this BigIntegerTest is to be divided.
  * @return {@code this / val}
  * @throws ArithmeticException if {@code val} is zero.
  */
BigInteger.prototype.divide = function (val) {
  var q = new MutableBigInteger();
  var a = new MutableBigInteger(this.mag);
  var b = new MutableBigInteger(val.mag);
  a.divide(b, q);
  return BigInteger.fromMutableBigInteger(q, this.signum === val.signum ? 1 : -1);
}

/**
 * Returns a BigInteger whose value is {@code (this % val)}.
 *
 * @param  val value by which this BigInteger is to be divided, and the
 *         remainder computed.
 * @return {@code this % val}
 * @throws ArithmeticException if {@code val} is zero.
 */
BigInteger.prototype.remainder = function (val) {
  var q = new MutableBigInteger();
  var a = new MutableBigInteger(this.mag);
  var b = new MutableBigInteger(val.mag);
  var x = a.divide(b, q);
  return BigInteger.fromMutableBigInteger(x, this.signum);
}

/**
 * Returns a BigInteger whose value is {@code (this mod m}).  This method
 * differs from {@code remainder} in that it always returns a
 * <i>non-negative</i> BigInteger.
 *
 * @param  m the modulus.
 * @return {@code this mod m}
 * @throws ArithmeticException {@code m} &le; 0
 * @see    #remainder
 */
BigInteger.prototype.mod = function (m) {
  if (m.signum <= 0)
    throw new Error("BigInteger: modulus not positive");

  var result = this.remainder(m);
  return (result.signum >= 0 ? result : result.add(m));
}

/**
 * Returns {@code true} if and only if the designated bit is set.
 * (Computes {@code ((this & (1<<n)) != 0)}.)
 *
 * @param  n index of bit to test.
 * @return {@code true} if and only if the designated bit is set.
 * @throws ArithmeticException {@code n} is negative.
 */
BigInteger.prototype.testBit = function (n) {
  if (n<0)
    throw new Error("Negative bit address");
  return (this._getInt(n >>> 5) & (1 << (n & 31))) != 0;
}

BigInteger.prototype.clone = function () {
  var _bigInteger = new BigInteger();
  _bigInteger.signum = this.signum;
  _bigInteger.mag = Common.copyOfRange(this.mag, 0, this.mag.length);
  return _bigInteger;
};

/*
 * Returns -1, 0 or +1 as big-endian unsigned int array arg1 is less than,
 * equal to, or greater than arg2 up to length len.
 */
function intArrayCmpToLen(arg1, arg2, len) {
  for (var i = 0; i < len; i++) {
    var b1 = Long.fromNumber(arg1[i] >>> 32);
    var b2 = Long.fromNumber(arg2[i] >>> 32);
    if (b1.compare(b2) < 0)
      return -1;
    if (b1.compare(b2) > 0)
      return 1;
  }
  return 0;
}

/**
 * Subtracts two numbers of same length, returning borrow.
 */
function subN(a, b, len) {
  var sum = Long.ZERO;

  while(--len >= 0) {
    sum = Long.fromNumber(a[len] >>> 32).subtract(Long.fromNumber(b[len] >>> 32)).add(sum.shiftRight(32));
    a[len] = sum.low;
  }

  return sum.shiftRight(32).low;
}

/**
 * Montgomery reduce n, modulo mod.  This reduces modulo mod and divides
 * by 2^(32*mlen). Adapted from Colin Plumb's C library.
 * int[] n, int[] mod, int mlen, int inv
 */
var montReduce = BigInteger.montReduce = function (n, mod, mlen, inv) {
  var c = 0;
  var len = mlen;
  var offset = 0;

  do {
    var nEnd = n[n.length - 1 - offset];
    var carry = mulAdd(n, mod, offset, mlen, Long.fromNumber(inv).multiply(Long.fromNumber(nEnd)).low);
    
    c += addOne(n, offset, mlen, carry);
    offset++;
  } while(--len > 0);

  while(c>0)
      c += subN(n, mod, mlen);

  while (intArrayCmpToLen(n, mod, mlen) >= 0)
      subN(n, mod, mlen);

  return n;
}

/**
 * Left shift int array a up to len by n bits. Returns the array that
 * results from the shift since space may have to be reallocated.
 */
function leftShift(a, len, n) {
    var nInts = n >>> 5;
    var nBits = n & 0x1F;
    var bitsInHighWord = BigIntegerLib.bitLengthForInt(a[0]);

    // If shift can be done without recopy, do so
    if (n <= (32-bitsInHighWord)) {
      primitiveLeftShift(a, len, nBits);
      return a;
    } else { // Array must be resized
      if (nBits <= (32-bitsInHighWord)) {
        var result = Common.intArray(nInts+len);
        for (var i=0; i<len; i++)
          result[i] = a[i];
        primitiveLeftShift(result, result.length, nBits);
        return result;
      } else {
        var result = Common.intArray(nInts + len + 1);
        for (var i=0; i<len; i++)
          result[i] = a[i];
        primitiveRightShift(result, result.length, 32 - nBits);
        return result;
      }
    }
}

/**
 * Returns a BigInteger whose value is x to the power of y mod z.
 * Assumes: z is odd && x < z.
 */
BigInteger.prototype.oddModPow = function (y, z) {
/*
 * The algorithm is adapted from Colin Plumb's C library.
 *
 * The window algorithm:
 * The idea is to keep a running product of b1 = n^(high-order bits of exp)
 * and then keep appending exponent bits to it.  The following patterns
 * apply to a 3-bit window (k = 3):
 * To append   0: square
 * To append   1: square, multiply by n^1
 * To append  10: square, multiply by n^1, square
 * To append  11: square, square, multiply by n^3
 * To append 100: square, multiply by n^1, square, square
 * To append 101: square, square, square, multiply by n^5
 * To append 110: square, square, multiply by n^3, square
 * To append 111: square, square, square, multiply by n^7
 *
 * Since each pattern involves only one multiply, the longer the pattern
 * the better, except that a 0 (no multiplies) can be appended directly.
 * We precompute a table of odd powers of n, up to 2^k, and can then
 * multiply k bits of exponent at a time.  Actually, assuming random
 * exponents, there is on average one zero bit between needs to
 * multiply (1/2 of the time there's none, 1/4 of the time there's 1,
 * 1/8 of the time, there's 2, 1/32 of the time, there's 3, etc.), so
 * you have to do one multiply per k+1 bits of exponent.
 *
 * The loop walks down the exponent, squaring the result buffer as
 * it goes.  There is a wbits+1 bit lookahead buffer, buf, that is
 * filled with the upcoming exponent bits.  (What is read after the
 * end of the exponent is unimportant, but it is filled with zero here.)
 * When the most-significant bit of this buffer becomes set, i.e.
 * (buf & tblmask) != 0, we have to decide what pattern to multiply
 * by, and when to do it.  We decide, remember to do it in future
 * after a suitable number of squarings have passed (e.g. a pattern
 * of "100" in the buffer requires that we multiply by n^1 immediately;
 * a pattern of "110" calls for multiplying by n^3 after one more
 * squaring), clear the buffer, and continue.
 *
 * When we start, there is one more optimization: the result buffer
 * is implcitly one, so squaring it or multiplying by it can be
 * optimized away.  Further, if we start with a pattern like "100"
 * in the lookahead window, rather than placing n into the buffer
 * and then starting to square it, we have already computed n^2
 * to compute the odd-powers table, so we can place that into
 * the buffer and save a squaring.
 *
 * This means that if you have a k-bit window, to compute n^z,
 * where z is the high k bits of the exponent, 1/2 of the time
 * it requires no squarings.  1/4 of the time, it requires 1
 * squaring, ... 1/2^(k-1) of the time, it reqires k-2 squarings.
 * And the remaining 1/2^(k-1) of the time, the top k bits are a
 * 1 followed by k-1 0 bits, so it again only requires k-2
 * squarings, not k-1.  The average of these is 1.  Add that
 * to the one squaring we have to do to compute the table,
 * and you'll see that a k-bit window saves k-2 squarings
 * as well as reducing the multiplies.  (It actually doesn't
 * hurt in the case k = 1, either.)
 */
  // Special case for exponent of one
  if (y.equals(ONE))
    return this;

  // Special case for base of zero
  if (this.signum==0)
      return ZERO;

  var base = Common.copyOfRange(this.mag, 0, this.mag.length);
  var exp = y.mag;
  var mod = z.mag;
  var modLen = mod.length;

  // Select an appropriate window size
  var wbits = 0;
  var ebits = BigIntegerLib.bitLength(exp, exp.length);
  // if exponent is 65537 (0x10001), use minimum window size
  if ((ebits != 17) || (exp[0] != 65537)) {
    while (ebits > bnExpModThreshTable[wbits]) {
      wbits++;
    }
  }

  // Calculate appropriate table size
  var tblmask = 1 << wbits;

  // Allocate table for precomputed odd powers of base in Montgomery form
  var table = new Array(tblmask);
  for (var i = 0; i < tblmask; i++) {
    table[i] = Common.intArray(modLen);
  }

  // Compute the modular inverse
  var inv = -MutableBigInteger.inverseMod32(mod[modLen-1]);
  
  // Convert base to Montgomery form
  var a = leftShift(base, base.length, modLen << 5);

  var q = new MutableBigInteger();
  var a2 = new MutableBigInteger(a);
  var b2 = new MutableBigInteger(mod);

  var r = a2.divide(b2, q);

  table[0] = r.toIntArray();
  // Pad table[0] with leading zeros so its length is at least modLen
  if (table[0].length < modLen) {
     var offset = modLen - table[0].length;
     var t2 = Common.intArray(modLen);
     for (var i=0; i < table[0].length; i++)
         t2[i+offset] = table[0][i];
     table[0] = t2;
  }

  // Set b to the square of the base
  var b = squareToLen(table[0], modLen, null);

  b = montReduce(b, mod, modLen, inv);

  // Set t to high half of b
  var t = Common.intArray(modLen);
  for(var i = 0; i < modLen; i++)
    t[i] = b[i];

  // Fill in the table with odd powers of the base
  for (var i=1; i < tblmask; i++) {
    var prod = multiplyToLen(t, modLen, table[i-1], modLen, null);
    table[i] = montReduce(prod, mod, modLen, inv);
  }

  // Pre load the window that slides over the exponent
  var bitpos = 1 << ((ebits-1) & (32-1));

  var buf = 0;
  var elen = exp.length;
  var eIndex = 0;
  for (var i = 0; i <= wbits; i++) {
    buf = (buf << 1) | (((exp[eIndex] & bitpos) != 0) ? 1 : 0);
    bitpos >>>= 1;
    if (bitpos == 0) {
      eIndex++;
      bitpos = 1 << (32-1);
      elen--;
    }
  }

  var multpos = ebits;

  // The first iteration, which is hoisted out of the main loop
  ebits--;
  var isone = true;

  multpos = ebits - wbits;

  while ((buf & 1) === 0) {
    buf >>>= 1;
    multpos++;
  }

  var mult = table[buf >>> 1];

  buf = 0;
  if (multpos == ebits)
      isone = false;

  // The main loop
  while(true) {
      ebits--;
      // Advance the window
      buf <<= 1;

      if (elen != 0) {
          buf |= ((exp[eIndex] & bitpos) != 0) ? 1 : 0;
          bitpos >>>= 1;
          if (bitpos == 0) {
              eIndex++;
              bitpos = 1 << (32-1);
              elen--;
          }
      }

      // Examine the window for pending multiplies
      if ((buf & tblmask) != 0) {
        multpos = ebits - wbits;
        while ((buf & 1) == 0) {
          buf >>>= 1;
          multpos++;
        }
        mult = table[buf >>> 1];
        buf = 0;
      }

      // Perform multiply
      if (ebits == multpos) {
          if (isone) {
              b = clone(mult);
              isone = false;
          } else {
              t = b;
              a = multiplyToLen(t, modLen, mult, modLen, a);
              a = montReduce(a, mod, modLen, inv);
              t = a; a = b; b = t;
          }
      }

      // Check if done
      if (ebits == 0)
          break;

      // Square the input
      if (!isone) {
          t = b;
          a = squareToLen(t, modLen, a);
          a = montReduce(a, mod, modLen, inv);
          t = a; a = b; b = t;
      }
  }

  // Convert result out of Montgomery form and return
  var t2 = Common.intArray(2 * modLen);
  for(var i = 0; i < modLen; i++)
      t2[i + modLen] = b[i];
    
  b = montReduce(t2, mod, modLen, inv);
  
  t2 = Common.intArray(modLen);
  for(var i=0; i<modLen; i++)
    t2[i] = b[i];

  return BigInteger.fromMag(t2, 1);
}

/**
 * Returns the index of the rightmost (lowest-order) one bit in this
 * BigInteger (the number of zero bits to the right of the rightmost
 * one bit).  Returns -1 if this BigInteger contains no one bits.
 * (Computes {@code (this==0? -1 : log2(this & -this))}.)
 *
 * @return index of the rightmost one bit in this BigInteger.
 */
BigInteger.prototype.getLowestSetBit = function () {
  var lsb = this.lowestSetBit - 2;
  if (lsb == -2) {  // lowestSetBit not initialized yet
    lsb = 0;
    if (this.signum == 0) {
        lsb -= 1;
    } else {
        // Search for lowest order nonzero int
        var i,b;
        for (i=0; (b = this._getInt(i))==0; i++)
            ;
        lsb += (i << 5) + Integer.numberOfTrailingZeros(b);
    }
    this.lowestSetBit = lsb + 2;
  }
  return lsb;
}

/**
 * Returns a BigInteger whose value is {@code (this}<sup>-1</sup> {@code mod m)}.
 *
 * @param  m the modulus.
 * @return {@code this}<sup>-1</sup> {@code mod m}.
 * @throws ArithmeticException {@code  m} &le; 0, or this BigInteger
 *         has no multiplicative inverse mod m (that is, this BigInteger
 *         is not <i>relatively prime</i> to m).
 */
BigInteger.prototype.modInverse = function (m) {
  if (m.signum != 1)
      throw new Error("BigInteger: modulus not positive");

  if (m.equals(ONE))
    return ZERO;

  // Calculate (this mod m)
  var modVal = this;
  if (this.signum < 0 || (this.compareMagnitude(m) >= 0))
      modVal = this.mod(m);

  if (modVal.equals(ONE))
      return ONE;

  var a = new MutableBigInteger(modVal);
  var b = new MutableBigInteger(m);

  var result = a.mutableModInverse(b);

  return BigInteger.fromMutableBigInteger(result, 1);
}

/**
 * Returns a BigInteger whose value is (this ** exponent) mod (2**p)
 */
BigInteger.prototype.modPow2 = function (exponent, p) {
  /*
   * Perform exponentiation using repeated squaring trick, chopping off
   * high order bits as indicated by modulus.
   */
  var result = BigInteger.valueOf(Long.fromNumber(1));
  var baseToPow2 = this.mod2(p);
  var expOffset = 0;

  var limit = exponent.bitLength();

  if (this.testBit(0))
     limit = (p-1) < limit ? (p-1) : limit;

  while (expOffset < limit) {
    if (exponent.testBit(expOffset))
      result = result.multiply(baseToPow2).mod2(p);
    expOffset++;
    if (expOffset < limit)
      baseToPow2 = baseToPow2.square().mod2(p);
  }

  return result;
}

/**
 * Returns a BigInteger whose value is {@code (this<sup>2</sup>)}.
 *
 * @return {@code this<sup>2</sup>}
 */
BigInteger.prototype.square = function () {
  if (this.signum == 0)
    return ZERO;
  var z = squareToLen(this.mag, this.mag.length, null);
  return BigInteger.fromMag(trustedStripLeadingZeroInts(z), 1);
}

/**
 * Returns a BigInteger whose value is this mod(2**p).
 * Assumes that this {@code BigInteger >= 0} and {@code p > 0}.
 */
BigInteger.prototype.mod2 = function (p) {
    if (this.bitLength() <= p)
      return this;
    // Copy remaining ints of mag
    var numInts = (p + 31) >>> 5;
    var mag = Common.intArray(numInts);
    for (var i=0; i<numInts; i++)
        mag[i] = this.mag[i + (this.mag.length - numInts)];

    // Mask out any excess bits
    var excessBits = (numInts << 5) - p;
    mag[0] &= Long.fromInt(1).shiftLeft(32-excessBits).low - 1;

    return (mag[0]==0 ? _fromMag(1, mag) : BigInteger.fromMag(mag, 1));
}

/**
 * Returns a BigInteger whose value is
 * <tt>(this<sup>exponent</sup> mod m)</tt>.  (Unlike {@code pow}, this
 * method permits negative exponents.)
 *
 * @param  exponent the exponent.
 * @param  m the modulus.
 * @return <tt>this<sup>exponent</sup> mod m</tt>
 * @throws ArithmeticException {@code m} &le; 0 or the exponent is
 *         negative and this BigInteger is not <i>relatively
 *         prime</i> to {@code m}.
 * @see    #modInverse
 */
BigInteger.prototype.modPow = function (exponent, m) {
  if (m.signum <= 0)
    throw new Error("BigInteger: modulus not positive");

  // Trivial cases
  if (exponent.signum == 0)
    return (m.equals(ONE) ? ZERO : ONE);

  if (this.equals(ONE))
    return (m.equals(ONE) ? ZERO : ONE);

  if (this.equals(ZERO) && exponent.signum >= 0)
    return ZERO;

  if (this.equals(negConst[1]) && (!exponent.testBit(0)))
    return (m.equals(ONE) ? ZERO : ONE);

  var invertResult;
  if ((invertResult = (exponent.signum < 0)))
    exponent = exponent.negate();

  var base = ((this.signum < 0 || this.compareTo(m) >= 0) ? this.mod(m) : this);
  var result;
  if (m.testBit(0)) { // odd modulus
    result = base.oddModPow(exponent, m);
  } else {
    /*
     * Even modulus.  Tear it into an "odd part" (m1) and power of two
     * (m2), exponentiate mod m1, manually exponentiate mod m2, and
     * use Chinese Remainder Theorem to combine results.
     */

    // Tear m apart into odd part (m1) and power of 2 (m2)
    var p = m.getLowestSetBit();   // Max pow of 2 that divides m

    var m1 = m.shiftRight(p);  // m/2**p
    var m2 = ONE.shiftLeft(p); // 2**p

    // Calculate new base from m1
    var base2 = (this.signum < 0 || this.compareTo(m1) >= 0 ? this.mod(m1) : this);
    // Caculate (base ** exponent) mod m1.
    var a1 = (m1.equals(ONE) ? ZERO : base2.oddModPow(exponent, m1));
    
    // Calculate (this ** exponent) mod m2
    var a2 = base.modPow2(exponent, p);
    
    a2.mag = [];
    a2.signum = 0;
    a2.bitLen = 1;

    // Combine results using Chinese Remainder Theorem
    var y1 = m2.modInverse(m1);
    var y2 = m1.modInverse(m2);

    result = a1.multiply(m2).multiply(y1).add(a2.multiply(m1).multiply(y2)).mod(m);
  }
  return (invertResult ? result.modInverse(m) : result);
}

/**
 * Converts this BigInteger to an {@code int}.  This
 * conversion is analogous to a
 * <i>narrowing primitive conversion</i> from {@code long} to
 * {@code int} as defined in section 5.1.3 of
 * <cite>The Java&trade; Language Specification</cite>:
 * if this BigInteger is too big to fit in an
 * {@code int}, only the low-order 32 bits are returned.
 * Note that this conversion can lose information about the
 * overall magnitude of the BigInteger value as well as return a
 * result with the opposite sign.
 *
 * @return this BigInteger converted to an {@code int}.
 */
BigInteger.prototype.intValue = function () {
  var result = this._getInt(0);;
  return result;
}

/**
 * Initialize static constant array when class is loaded.
 */
var MAX_CONSTANT = 16;
var posConst = new Array(MAX_CONSTANT + 1);
var negConst = new Array(MAX_CONSTANT + 1);

for (var i = 1; i <= MAX_CONSTANT; i++) {
  var magnitude = Common.intArray(1);
  magnitude[0] = i;
  posConst[i] = BigInteger.fromMag(magnitude,  1);
  negConst[i] = BigInteger.fromMag(magnitude, -1);
}

var bnExpModThreshTable = [7, 25, 81, 241, 673, 1793, Integer.MAX_VALUE];

var ZERO = BigInteger.fromMag([], 0);
var ONE = BigInteger.fromMag([1], 1);

BigInteger.ZERO = ZERO;
BigInteger.ONE = ONE;

module.exports = BigInteger;


}).call(this,require("buffer").Buffer)

},{"./BigIntegerLib":13,"./Integer":14,"./MutableBigInteger":15,"./common":16,"buffer":3,"clone":17,"long":19}],13:[function(require,module,exports){
var Integer = require('./Integer');

// shifts a up to len left n bits assumes no leading zeros, 0<=n<32
// int[] a, int len, int n
exports.primitiveLeftShift =  function (a, len, n) {
  if (len == 0 || n == 0)
    return;
  var n2 = 32 - n;
  for (var i=0, c=a[i], m=i+len-1; i<m; i++) {
    var b = c;
    c = a[i+1];
    a[i] = (b << n) | (c >>> n2);
  }
  a[len-1] <<= n;
}

var bitLengthForInt = exports.bitLengthForInt = function (i) {
  return 32 - Integer.numberOfLeadingZeros(i);
}

/**
 * Calculate bitlength of contents of the first len elements an int array,
 * assuming there are no leading zero ints.
 */ 
exports.bitLength = function (val, len) {
  if (len == 0)
    return 0;
  return ((len - 1) << 5) + bitLengthForInt(val[0]);
}

},{"./Integer":14}],14:[function(require,module,exports){

function Integer() {

}
/**
 * Returns the number of zero bits following the lowest-order ("rightmost")
 * one-bit in the two's complement binary representation of the specified
 * {@code int} value.  Returns 32 if the specified value has no
 * one-bits in its two's complement representation, in other words if it is
 * equal to zero.
 *
 * @return the number of zero bits following the lowest-order ("rightmost")
 *     one-bit in the two's complement binary representation of the
 *     specified {@code int} value, or 32 if the value is equal
 *     to zero.
 * @since 1.5
 */
Integer.numberOfTrailingZeros = function (i) {
  // HD, Figure 5-14
  var y;
  if (i == 0) return 32;
  var n = 31;
  y = i <<16; if (y != 0) { n = n -16; i = y; }
  y = i << 8; if (y != 0) { n = n - 8; i = y; }
  y = i << 4; if (y != 0) { n = n - 4; i = y; }
  y = i << 2; if (y != 0) { n = n - 2; i = y; }
  return n - ((i << 1) >>> 31);
}

Integer.numberOfLeadingZeros = function (i) {
  // HD, Figure 5-6
  if (i == 0)
    return 32;
  
  var n = 1;
  if (i >>> 16 == 0) { n += 16; i <<= 16; }
  if (i >>> 24 == 0) { n +=  8; i <<=  8; }
  if (i >>> 28 == 0) { n +=  4; i <<=  4; }
  if (i >>> 30 == 0) { n +=  2; i <<=  2; }
  n -= i >>> 31;

  return n;
}

Integer.bitCount = function (i) {
  // HD, Figure 5-2
  i = i - ((i >>> 1) & 0x55555555);
  i = (i & 0x33333333) + ((i >>> 2) & 0x33333333);
  i = (i + (i >>> 4)) & 0x0f0f0f0f;
  i = i + (i >>> 8);
  i = i + (i >>> 16);
  return i & 0x3f;
}

Integer.MIN_VALUE = 0x80000000;

Integer.MAX_VALUE = 0x7fffffff;

Integer.digits = [
  '0' , '1' , '2' , '3' , '4' , '5' ,
  '6' , '7' , '8' , '9' , 'a' , 'b' ,
  'c' , 'd' , 'e' , 'f' , 'g' , 'h' ,
  'i' , 'j' , 'k' , 'l' , 'm' , 'n' ,
  'o' , 'p' , 'q' , 'r' , 's' , 't' ,
  'u' , 'v' , 'w' , 'x' , 'y' , 'z'
]

module.exports = Integer;
},{}],15:[function(require,module,exports){

var Integer = require('./Integer');
var BigIntegerLib = require('./BigIntegerLib');
var Long = require('long');
var Common = require('./common');
var util = require('util');

function MutableBigInteger(val) {
  if (typeof val === 'undefined') {
    // @see MutableBigInteger()
    this.value = [0];
    this.intLen = 0;
  
  } else if (Array.isArray(val)) {
    // @see MutableBigInteger(int[] val)
    this.value = val;
    this.intLen = val.length;
  
  } else if (val.constructor.name === 'MutableBigInteger') {
    // @see  MutableBigInteger(MutableBigInteger val)
    this.intLen = val.intLen;
    this.value = Common.copyOfRange(val.value, val.offset, val.offset + this.intLen);
  
  } else if (val.constructor.name === 'BigInteger') {
    // @see public static int[] copyOf(int[] original, int newLength)
    this.intLen = val.mag.length;
    this.value = Common.copyOf(val.mag, this.intLen);

  } else if (typeof val === 'number') {
    // @see MutableBigInteger(int val) 
    this.value = [0];
    this.intLen = 0;
    this.value[0] = val;
  
  } else {
    // @see MutableBigInteger()
    this.value = [0];
    this.intLen = 0;
  
  }
   this.offset = 0;
}

/**
 * Calculates the quotient of this div b and places the quotient in the
 * provided MutableBigInteger objects and the remainder object is returned.
 *
 * Uses Algorithm D in Knuth section 4.3.1.
 * Many optimizations to that algorithm have been adapted from the Colin
 * Plumb C library.
 * It special cases one word divisors for speed. The content of b is not
 * changed.
 *
 */
MutableBigInteger.prototype.divide = function (b, quotient) {
  if (b.intLen === 0) {
    throw new Error("BigIntegerTest divide by zero");
  }
  // Dividend is zero
  if (this.intLen == 0) {
    quotient.intLen = quotient.offset;
    return new MutableBigInteger();
  }

  var cmp = this.compare(b);
  // Dividend less than divisor
  if (cmp < 0) {
    quotient.intLen = quotient.offset = 0;
    return new MutableBigInteger(this);
  }
  // Dividend equal to divisor
  if (cmp === 0) {
    quotient.value[0] = quotient.intLen = 1;
    quotient.offset = 0;
    return new MutableBigInteger();
  }

  quotient.clear();
  // Special case one word divisor
  if (b.intLen === 1) {
    var r = this.divideOneWord(b.value[b.offset], quotient);
    if (r === 0)
      return new MutableBigInteger();
    return new MutableBigInteger([r]);
  }

  // Copy divisor value to protect divisor
  var div = Common.copyOfRange(b.value, b.offset, b.offset + b.intLen);
  return this.divideMagnitude(div, quotient);
}

/**
 * Divide this MutableBigInteger by the divisor represented by its magnitude
 * array. The quotient will be placed into the provided quotient object &
 * the remainder object is returned.
 */
MutableBigInteger.prototype.divideMagnitude = function (divisor, quotient) {
  // Remainder starts as dividend with space for a leading zero
  var rem = new MutableBigInteger(Common.intArray(this.intLen + 1));
  Common.arraycopy(this.value, this.offset, rem.value, 1, this.intLen);
  rem.intLen = this.intLen;
  rem.offset = 1;
  
  var nlen = rem.intLen;

  // Set the quotient size
  var dlen = divisor.length;
  var limit = nlen - dlen + 1;
  if (quotient.value.length < limit) {
    quotient.value =  Common.intArray(limit);
    quotient.offset = 0;
  }
  quotient.intLen = limit;
  // int[]
  var q = quotient.value;

  // D1 normalize the divisor
  var shift = Integer.numberOfLeadingZeros(divisor[0]);
  if (shift > 0) {
      // First shift will not grow array
      BigIntegerLib.primitiveLeftShift(divisor, dlen, shift);
      // But this one might
      rem.leftShift(shift);
  }

  // Must insert leading 0 in rem if its length did not change
  if (rem.intLen == nlen) {
    rem.offset = 0;
    rem.value[0] = 0;
    rem.intLen++;
  }

  var dh = divisor[0];
  var dhLong = Long.fromNumber(dh >>> 32);
  var dl = divisor[1];
  var qWord = [0, 0];
  
  // D2 Initialize j
  for(var j = 0; j < limit; j++) {
    // D3 Calculate qhat
    // estimate qhat
    var qhat = 0;
    var qrem = 0;
    var skipCorrection = false;
    var nh = rem.value[j + rem.offset];
    var nh2 = Long.fromNumber(nh).add(Long.fromNumber(0x80000000)).low;
    var nm = rem.value[j + 1 + rem.offset];

    if (nh === dh) {
      qhat = ~0;
      qrem = nh + nm;
      skipCorrection = Long.fromNumber(qrem).add(Long.fromNumber(0x80000000)).low < nh2;
    } else {
      var nChunk = Long.fromNumber(nh).shiftLeft(32).or(Long.fromNumber(nm >>> 32));
      if (nChunk >= 0) {
        qhat = nChunk.div(dhLong).low;
        qrem = nChunk.subtract(Long.fromNumber(qhat).multiply(dhLong)).low;
      } else {
        this.divWord(qWord, nChunk, dh);
        qhat = qWord[0];
        qrem = qWord[1];
      }
    }

    if (qhat == 0)
      continue;

    if (!skipCorrection) { // Correct qhat
      var nl = Long.fromNumber(rem.value[j + 2 + rem.offset] >>> 32);
      var rs = Long.fromNumber(qrem >>> 32).shiftLeft(32).or(nl);
      var estProduct = Long.fromNumber(dl >>> 32).multiply(Long.fromNumber(qhat >>> 32));

      if (this.unsignedLongCompare(estProduct, rs)) {
        qhat--;
        var qrem = Long.fromNumber(qrem >>> 32).add(dhLong).low;
        if (Long.fromNumber(qrem >>> 32).compare(dhLong) >= 0) {
          estProduct = estProduct.subtract(Long.fromNumber(dl >>> 32));
          rs = Long.fromNumber(qrem >>> 32).shiftLeft(32).or(nl);
          if (this.unsignedLongCompare(estProduct, rs)) {
            qhat--;
          }
        }

      }
    }

    // D4 Multiply and subtract
    rem.value[j + rem.offset] = 0;
    
    var borrow = this.mulsub(rem.value, divisor, qhat, dlen, j + rem.offset);

    // D5 Test remainder
    if (Long.fromNumber(borrow).add(Long.fromNumber(0x80000000)).low > nh2) {
      // D6 Add back
      this.divadd(divisor, rem.value, j+1+rem.offset);
      qhat--;
    }

    // // Store the quotient digit
    q[j] = qhat;
  } // D7 loop on j

  // D8 Unnormalize
  if (shift > 0)
    rem.rightShift(shift);

  quotient.normalize();
  rem.normalize();
  return rem;
}

/**
* A primitive used for division. This method adds in one multiple of the
* divisor a back to the dividend result at a specified offset. It is used
* when qhat was estimated too large, and must be adjusted.
* int[] a, int[] result, int offset
*/
MutableBigInteger.prototype.divadd = function (a, result, offset) {
  var carry = Long.fromInt(0);
  for (var j = a.length-1; j >= 0; j--) {
    var sum = Long.fromNumber(a[j] >>> 32).add(Long.fromNumber(result[j + offset] >>> 32)).add(carry);
    result[j+offset] = sum.low;
    carry = sum.shiftRightUnsigned(32);
  }
  return carry.low;
}

/**
 * Ensure that the MutableBigInteger is in normal form, specifically
 * making sure that there are no leading zeros, and that if the
 * magnitude is zero, then intLen is zero.
 */
MutableBigInteger.prototype.normalize = function () {
  if (this.intLen === 0) {
    this.offset = 0;
    return;
  }

  var index = this.offset;
  if (this.value[index] != 0)
    return;

  var indexBound = index + this.intLen;
  do {
    index++;
  } while((index < indexBound) && (this.value[index] === 0));
  var numZeros = index - this.offset;
  this.intLen -= numZeros;
  this.offset = (this.intLen === 0 ?  0 : this.offset + numZeros);
}

/**
 * This method is used for division. It multiplies an n word input a by one
 * word input x, and subtracts the n word product from q. This is needed
 * when subtracting qhat*divisor from dividend.
 * int[] q, int[] a, int x, int len, int offset
 */
MutableBigInteger.prototype.mulsub = function (q, a, x, len, offset) {
  var xLong = Long.fromNumber(x >>> 32);
  var carry = Long.fromNumber(0);
  offset += len;
  for (var j = len - 1; j >= 0; j--) {
    var product = Long.fromNumber(a[j] >>> 32).multiply(xLong).add(carry);
    var difference = Long.fromNumber(q[offset]).subtract(product);
    q[offset--] = difference.low;
    carry = product.shiftRightUnsigned(32).add( 
      Long.fromNumber(difference.low >>>32).compare(Long.fromNumber(~product.low >>> 32)) > 0 ? Long.fromInt(1) : Long.fromInt(0)
    );
  }

  return carry.low;
}

/**
 * Compare two longs as if they were unsigned.
 * Returns true iff one is bigger than two.
 */
MutableBigInteger.prototype.unsignedLongCompare = function (one, two) {
  return one.add(Long.MIN_VALUE).compare(two.add(Long.MIN_VALUE)) > 0;
}

/**
 * [divWord description]
 * @param  {int[] } result [description]
 * @param  {long} n             [description]
 * @param  {int}     d             [description]
 * @return {[type]}        [description]
 */
MutableBigInteger.prototype.divWord = function (result, n, d) {
  // if (typeof n === 'number') {
  //   n = Long.fromNumber(n);
  // }
  // long
  var dLong = Long.fromNumber(d >>> 32);

  if (dLong.toNumber() === 1) {
    result[0] = n.low;
    result[1] = 0;
    return;
  }

  // Approximate the quotient and remainder
  // var q = (n >>> 1) / (dLong >>> 1);
  var q = n.shiftRightUnsigned(1).div(dLong.shiftRightUnsigned(1));

  // var r = n - q * dLong;
  var r = n.subtract(q.multiply(dLong));
  var zero = Long.fromInt(0);
  // Correct the approximation
  while (r.compare(zero) < 0) {
    // r += dLong;
    r = r.add(dLong);
    // q--;
    q = q.subtract(Long.fromInt(1));
  }
  while (r.compare(dLong) >= 0) {
    // r -= dLong;
    // q++;
    r = r.subtract(dLong);
    q = q.add(1);
  }

  result[0] = q.low;
  result[1] = r.low;
}

/**
 * [primitiveLeftShift description]
 * @param  {int[]}  a             [description]
 * @param  {int}  len           [description]
 * @param  {int}  n             [description]
 * @return {[type]}       [description]
 */
MutableBigInteger.prototype.primitiveLeftShift = function (n) {
  var val = this.value;
  var n2 = 32 - n;
  for (var i = this.offset, c = val[i], m = i + this.intLen - 1; i < m; i++) {
    var b = c;
    c = val[i + 1];
    val[i] = (b << n) | (c >>> n2);
  }
  val[this.offset + this.intLen - 1] <<= n;
}

/**
 * Right shift this MutableBigInteger n bits, where n is
 * less than 32.
 * Assumes that intLen > 0, n > 0 for speed
 */
MutableBigInteger.prototype.primitiveRightShift = function (n) {
  var val = this.value;
  var n2 = 32 - n;
  for (var i = this.offset + this.intLen - 1, c = val[i]; i > this.offset; i--) {
    var b = c;
    c = val[i-1];
    val[i] = (c << n2) | (b >>> n);
  }
  val[this.offset] >>>= n;
}

/**
 * Left shift this MutableBigInteger n bits.
 * int 
 */
MutableBigInteger.prototype.leftShift = function (n) {
  /*
   * If there is enough storage space in this MutableBigInteger already
   * the available space will be used. Space to the right of the used
   * ints in the value array is faster to utilize, so the extra space
   * will be taken from the right if possible.
   */
  if (this.intLen == 0)
     return;
  var nInts = n >>> 5;
  var nBits = n & 0x1F;
  var bitsInHighWord = BigIntegerLib.bitLengthForInt(this.value[this.offset]);

  // If shift can be done without moving words, do so
  if (n <= (32 - bitsInHighWord)) {
    this.primitiveLeftShift(nBits);
    return;
  }

  var newLen = this.intLen + nInts +1;
  if (nBits <= (32 - bitsInHighWord))
    newLen--;
  if (this.value.length < newLen) {
    // The array must grow
    var result =  Common.intArray(newLen);
    for (var i = 0; i < this.intLen; i++)
      result[i] = this.value[this.offset+i];
    this.setValue(result, newLen);
  } else if (this.value.length - this.offset >= newLen) {
    // Use space on right
    for(var i = 0; i < newLen - this.intLen; i++)
      this.value[this.offset + this.intLen + i] = 0;
  } else {
    // Must use space on left
    for (var i = 0; i < this.intLen; i++)
      this.value[i] = this.value[this.offset+i];
    for (var i = this.intLen; i < newLen; i++)
      this.value[i] = 0;
    this.offset = 0;
  }
  this.intLen = newLen;
  if (nBits == 0)
    return;
  if (nBits <= (32 - bitsInHighWord))
    this.primitiveLeftShift(nBits);
  else
    this.primitiveRightShift(32 - nBits);
}

/**
 * Right shift this MutableBigInteger n bits. The MutableBigInteger is left
 * in normal form.
 */
MutableBigInteger.prototype.rightShift = function (n) {
  if (this.intLen === 0)
    return;
  var nInts = n >>> 5;
  var nBits = n & 0x1F;
  this.intLen -= nInts;
  if (nBits == 0)
    return;
  var bitsInHighWord = BigIntegerLib.bitLengthForInt(this.value[this.offset]);
  if (nBits >= bitsInHighWord) {
    this.primitiveLeftShift(32 - nBits);
    this.intLen--;
  } else {
    this.primitiveRightShift(nBits);
  }
}

/**
 * Sets this MutableBigInteger's value array to the specified array.
 * The intLen is set to the specified length.
 * int[] 
 */
MutableBigInteger.prototype.setValue = function (val, length) {
  this.value = val;
  this.intLen = length;
  this.offset = 0;
}

/**
 * This method is used for division of an n word dividend by a one word
 * divisor. The quotient is placed into quotient. The one word divisor is
 * specified by divisor.
 *
 * @return the remainder of the division is returned.
 *
 */
MutableBigInteger.prototype.divideOneWord = function (divisor, quotient) {
  var divisorLong = Long.fromNumber(divisor >>> 32);
  // Special case of one word dividend
  if (this.intLen === 1) {
    var dividendValue = Long.fromNumber(this.value[this.offset] >>> 32);
    var q = dividendValue.div(divisorLong).low;
    var r = dividendValue.subtract(Long.fromInt(q).multiply(divisorLong)).low;
    quotient.value[0] = q;
    quotient.intLen = (q == 0) ? 0 : 1;
    quotient.offset = 0;
    return r;
  }

  if (quotient.value.length < this.intLen){
    quotient.value = Common.intArray(this.intLen);
  }
  quotient.offset = 0;
  quotient.intLen = this.intLen;

  // Normalize the divisor
  var shift = Integer.numberOfLeadingZeros(divisor);

  var rem = this.value[this.offset];
  var remLong = Long.fromNumber(rem >>> 32);
  if (remLong.compare(divisorLong) < 0) {
    quotient.value[0] = 0;
  } else {
    quotient.value[0] = remLong.div(divisorLong).low;
    rem = remLong.subtract(Long.fromInt(quotient.value[0]).multiply(divisorLong)).low;
    remLong = Long.fromNumber(rem >>> 32);
  }

  var xlen = this.intLen;
  var qWord = Common.intArray(2);
  while (--xlen > 0) {
      var dividendEstimate = (remLong.shiftLeft(32)).or(
          Long.fromNumber(this.value[this.offset + this.intLen - xlen] >>> 32)
        );
      if (dividendEstimate.toNumber() >= 0) {
          qWord[0] = dividendEstimate.div(divisorLong).low;
          qWord[1] = dividendEstimate.subtract(Long.fromInt(qWord[0]).multiply(divisorLong)).low;
      } else {
          this.divWord(qWord, dividendEstimate, divisor);
      }
      quotient.value[this.intLen - xlen] = qWord[0];
      rem = qWord[1];
      remLong = Long.fromNumber(rem >>> 32);
  }

  quotient.normalize();
  // Unnormalize
  if (shift > 0)
    return rem % divisor;
  else
    return rem;
}

/**
 * Compare the magnitude of two MutableBigIntegers. Returns -1, 0 or 1
 * as this MutableBigInteger is numerically less than, equal to, or
 * greater than <tt>b</tt>.
 */
MutableBigInteger.prototype.compare = function (b) {
  var blen = b.intLen;
  if (this.intLen < blen)
    return -1;
  if (this.intLen > blen)
   return 1;

  // Add Integer.MIN_VALUE to make the comparison act as unsigned integer
  // comparison.
  var _x8 = Long.fromNumber(0x80000000);
  var bval = b.value;
  for (var i = this.offset, j = b.offset; i < this.intLen + this.offset; i++, j++) {
    var b1 = Long.fromNumber(this.value[i]).add(_x8).low;
    var b2 = Long.fromNumber(bval[j]).add(_x8).low;
    if (b1 < b2)
      return -1;
    if (b1 > b2)
      return 1;
  }
  return 0;
}

/**
 * Clear out a MutableBigInteger for reuse.
 */
MutableBigInteger.prototype.clear = function () {
  this.offset = this.intLen = 0;
  for (var index = 0, n = this.value.length; index < n; index++)
    this.value[index] = 0;
}

MutableBigInteger.prototype.clone = function () {
  var val = Common.intArray(this.intLen);
  for (var i = 0; i < this.intLen; i++) {
    val[i] = this.value[i];
  }
  return new MutableBigInteger(val);
}

MutableBigInteger.prototype.getMagnitudeArray = function () {
  if (this.offset > 0 || this.value.length != this.intLen) {
    return Common.copyOfRange(this.value, this.offset, this.offset + this.intLen);
  }
  return this.value;
};

// @see BigInteger.fromMutableBigInteger(mb, sign);
// MutableBigInteger.prototype.toBigInteger = function (sign) {
//   if (this.intLen == 0 || sign == 0) {
//     return BigInteger.fromMag([0], 0);
//   }
//   return BigInteger.fromMag(this.getMagnitudeArray(), sign);
// }


/*
 * Returns the multiplicative inverse of val mod 2^32.  Assumes val is odd.
 */
MutableBigInteger.inverseMod32 = function (val) {
    // Newton's iteration!
    val  = Long.fromInt(val);
    var t = Long.fromInt(val);
    var two = Long.fromInt(2);
    
    t = Long.fromNumber(t.multiply(two.subtract(val.multiply(t))).low);
    t = Long.fromNumber(t.multiply(two.subtract(val.multiply(t))).low);
    t = Long.fromNumber(t.multiply(two.subtract(val.multiply(t))).low);
    t = t.multiply(two.subtract(val.multiply(t))).low;

    return t;
}

/**
 * Convert this MutableBigInteger into an int array with no leading
 * zeros, of a length that is equal to this MutableBigInteger's intLen.
 */
MutableBigInteger.prototype.toIntArray = function () {
  var result = Common.intArray(this.intLen);
  for(var i = 0; i < this.intLen; i++)
    result[i] = this.value[this.offset + i];
  return result;
}

/**
 * Returns true iff this MutableBigInteger has a value of zero.
 */
MutableBigInteger.prototype.isZero = function () {
    return (this.intLen === 0);
}

MutableBigInteger.prototype.isOdd = function () {
  return this.isZero() ? false : ((this.value[this.offset + this.intLen - 1] & 1) === 1);
}

/**
 * Returns true iff this MutableBigInteger has a value of one.
 */
MutableBigInteger.prototype.isOne = function () {
  return (this.intLen == 1) && (this.value[this.offset] == 1);
}

/**
 * Returns true iff this MutableBigInteger is even.
 */
MutableBigInteger.prototype.isEven = function () {
  return (this.intLen == 0) || ((this.value[this.offset + this.intLen - 1] & 1) == 0);
}

/**
* Return the index of the lowest set bit in this MutableBigInteger. If the
* magnitude of this MutableBigInteger is zero, -1 is returned.
*/
MutableBigInteger.prototype.getLowestSetBit = function () {
  if (this.intLen == 0)
      return -1;
  var j, b;
  for (j = this.intLen-1; (j>0) && (this.value[j+this.offset]==0); j--)
      ;
  b = this.value[j+this.offset];
  if (b==0)
      return -1;
  return ((this.intLen-1-j)<<5) + Integer.numberOfTrailingZeros(b);
}


/**
 * Calculate the multiplicative inverse of this mod mod, where mod is odd.
 * This and mod are not changed by the calculation.
 *
 * This method implements an algorithm due to Richard Schroeppel, that uses
 * the same intermediate representation as Montgomery Reduction
 * ("Montgomery Form").  The algorithm is described in an unpublished
 * manuscript entitled "Fast Modular Reciprocals."
 */
MutableBigInteger.prototype.modInverse = function (mod) {
    var p = new MutableBigInteger(mod);
    var f = new MutableBigInteger(this);
    var g = new MutableBigInteger(p);
    var c = new SignedMutableBigInteger(1);
    var d = new SignedMutableBigInteger();
    var temp = null;
    var sTemp = null;

    var k = 0;
    // Right shift f k times until odd, left shift d k times
    if (f.isEven()) {
        var trailingZeros = f.getLowestSetBit();
        f.rightShift(trailingZeros);
        d.leftShift(trailingZeros);
        k = trailingZeros;
    }
    // The Almost Inverse Algorithm
    while(!f.isOne()) {
        // If gcd(f, g) != 1, number is not invertible modulo mod
        if (f.isZero())
            throw new Error("BigInteger not invertible.");

        // If f < g exchange f, g and c, d
        if (f.compare(g) < 0) {
            temp = f; f = g; g = temp;
            sTemp = d; d = c; c = sTemp;
        }

        // If f == g (mod 4)
        if (((f.value[f.offset + f.intLen - 1] ^
             g.value[g.offset + g.intLen - 1]) & 3) == 0) {
            f.subtract(g);
            c.signedSubtract(d);
        } else { // If f != g (mod 4)
            f.add(g);
            c.signedAdd(d);
        }
        // Right shift f k times until odd, left shift d k times
        var trailingZeros = f.getLowestSetBit();
        f.rightShift(trailingZeros);
        d.leftShift(trailingZeros);
        k += trailingZeros;
    }
    
    while (c.sign < 0) {
      c.signedAdd(p);
    }
    return fixup(c, p, k);
}
/*
 * The Fixup Algorithm
 * Calculates X such that X = C * 2^(-k) (mod P)
 * Assumes C<P and P is odd.
 */
function fixup(c, p, k) {
  var temp = new MutableBigInteger();
  // Set r to the multiplicative inverse of p mod 2^32
  var r = -MutableBigInteger.inverseMod32(p.value[p.offset+p.intLen-1]);
  for(var i=0, numWords = k >> 5; i<numWords; i++) {
      // V = R * c (mod 2^j)
      var v = Long.fromNumber(r).multiply(c.value[c.offset + c.intLen - 1]).low;
      // var  v = r * c.value[c.offset + c.intLen - 1];
      // c = c + (v * p)
      p.mul(v, temp);
      c.add(temp);
      // c = c / 2^j
      c.intLen--;
  }
  var numBits = k & 0x1f;
  if (numBits != 0) {
      var v = Long.fromNumber(r).multiply(c.value[c.offset + c.intLen - 1]).low;
      v &= ((1 << numBits) - 1);
      // c = c + (v * p)
      p.mul(v, temp);
      c.add(temp);
      // c = c / 2^j
      c.rightShift(numBits);
  }
  // In theory, c may be greater than p at this point (Very rare!)
  while (c.compare(p) >= 0)
    c.subtract(p);
  return c;
}

MutableBigInteger.prototype.reset = function () {
  this.offset = this.intLen = 0;
};

/**
 * Subtracts the smaller of this and b from the larger and places the
 * result into this MutableBigInteger.
 */
MutableBigInteger.prototype.subtract = function (b) {
    var a = this;

    var result = this.value;
    var sign = a.compare(b);

    if (sign == 0) {
        this.reset();
        return 0;
    }
    if (sign < 0) {
        var tmp = a;
        a = b;
        b = tmp;
    }

    var resultLen = a.intLen;
    if (result.length < resultLen)
        result = Common.intArray(resultLen);

    var diff = Long.fromInt(0);
    var x = a.intLen;
    var y = b.intLen;
    var rstart = result.length - 1;

    // Subtract common parts of both numbers
    while (y>0) {
        x--; y--;

        diff = Long.fromNumber(a.value[x+a.offset] >>> 32).subtract(
            Long.fromNumber((b.value[y+b.offset] >>> 32))
        ).subtract(
           Long.fromNumber(diff.shiftRight(32).negate().low)
        );

        result[rstart--] = diff.low;
    }
    // Subtract remainder of longer number
    while (x>0) {
        x--;
        diff = Long.fromNumber(a.value[x+a.offset] >>> 32).subtract(
           Long.fromNumber(diff.shiftRight(32).negate().low)
        );
        result[rstart--] = diff.low;
    }

    this.value = result;
    this.intLen = resultLen;
    this.offset = this.value.length - resultLen;
    this.normalize();
    return sign;
}

MutableBigInteger.prototype.reset = function () {
  this.offset = this.intLen = 0;
}

/**
 * Sets this MutableBigInteger's value array to a copy of the specified
 * array. The intLen is set to the length of the new array.
 */
MutableBigInteger.prototype.copyValue = function (src) {
  if (src.constructor.name === 'MutableBigInteger') {
    var len = src.intLen;
    if (this.value.length < len)
      this.value = Common.intArray(len);
    Common.arraycopy(src.value, src.offset, this.value, 0, len);
    this.intLen = len;
    this.offset = 0;  
  } else if (Array.isArray(src)) {
    var val = src;
    var len = val.length;
    if (this.value.length < len)
        this.value = Common.intArray(len);
    Common.arraycopy(val, 0, this.value, 0, len);
    this.intLen = len;
    this.offset = 0;
  }
  
}

/**
 * Multiply the contents of this MutableBigInteger by the word y. The
 * result is placed into z.
 */
MutableBigInteger.prototype.mul = function (y, z) {
  if (y == 1) {
      z.copyValue(this);
      return;
  }

  if (y == 0) {
      z.clear();
      return;
  }

  // Perform the multiplication word by word
  var ylong = Long.fromNumber(y >>> 32);
  var zval = (z.value.length < this.intLen+1 ? Common.intArray(this.intLen + 1) : z.value);
  var carry = Long.fromInt(0);
  for (var i = this.intLen-1; i >= 0; i--) {
      var product = ylong.multiply(Long.fromNumber(this.value[i+this.offset] >>> 32)).add(carry);
      zval[i+1] = product.low;
      carry = product.shiftRightUnsigned(32);
  }

  if (carry.toNumber() === 0) {
      z.offset = 1;
      z.intLen = this.intLen;
  } else {
      z.offset = 0;
      z.intLen = this.intLen + 1;
      zval[0] = carry.low;
  }
  z.value = zval;
}

/**
 * Multiply the contents of two MutableBigInteger objects. The result is
 * placed into MutableBigInteger z. The contents of y are not changed.
 */
MutableBigInteger.prototype.multiply = function (y, z) {
    var xLen = this.intLen;
    var yLen = y.intLen;
    var newLen = xLen + yLen;

    // Put z into an appropriate state to receive product
    if (z.value.length < newLen)
        z.value = Common.intArray(newLen);
    z.offset = 0;
    z.intLen = newLen;

    // The first iteration is hoisted out of the loop to avoid extra add
    var carry = Long.fromInt(0);
    for (var j=yLen-1, k=yLen+xLen-1; j >= 0; j--, k--) {
        var product = Long.fromNumber(y.value[j+y.offset] >>> 32).multiply(
            Long.fromNumber(this.value[xLen - 1 + this.offset] >>> 32)
        ).add(carry);
        z.value[k] = product.low;
        carry = product.shiftRightUnsigned(32);
    }
    z.value[xLen-1] = carry.low;

    // Perform the multiplication word by word
    for (var i = xLen-2; i >= 0; i--) {
        carry = Long.fromInt(0);
        for (var j=yLen-1, k=yLen+i; j >= 0; j--, k--) {
            var product = Long.fromNumber(y.value[j+y.offset] >>> 32).multiply(
                Long.fromNumber(this.value[i + this.offset] >>> 32)
            ).add(
                Long.fromNumber(z.value[k] >>> 32)
            ).add(carry);
            z.value[k] = product.low;
            carry = product.shiftRightUnsigned(32);
        }
        z.value[i] = carry.low;
    }

    // Remove leading zeros from product
    z.normalize();
}


/**
 * Adds the contents of two MutableBigInteger objects.The result
 * is placed within this MutableBigInteger.
 * The contents of the addend are not changed.
 */
MutableBigInteger.prototype.add = function (addend) {
    var x = this.intLen;
    var y = addend.intLen;
    var resultLen = (this.intLen > addend.intLen ? this.intLen : addend.intLen);
    var result = (this.value.length < resultLen ? Common.intArray(resultLen) : this.value);

    var rstart = result.length-1;
    var sum;
    var carry = Long.fromInt(0);

    // Add common parts of both numbers
    while(x>0 && y>0) {
        x--; y--;
        sum = Long.fromNumber(this.value[x+this.offset] >>> 32).add(
            Long.fromNumber(addend.value[y+addend.offset] >>> 32)
        ).add(carry);

        result[rstart--] = sum.low;
        carry = sum.shiftRightUnsigned(32);
    }

    // Add remainder of the longer number
    while(x>0) {
        x--;
        if (carry == 0 && result == this.value && rstart == (x + this.offset))
            return;
        sum = Long.fromNumber(this.value[x+this.offset] >>> 32).add(carry);
        result[rstart--] = sum.low;
        carry = sum.shiftRightUnsigned(32);
    }
    while(y>0) {
        y--;
        sum = Long.fromNumber(addend.value[y+addend.offset] >>> 32).add(carry);
        result[rstart--] = sum.low;
        carry = sum.shiftRightUnsigned(32);
    }

    if (carry.toNumber() > 0) { // Result must grow in length
        resultLen++;
        if (result.length < resultLen) {
            var temp = Common.intArray(resultLen);
            // Result one word longer from carry-out; copy low-order
            // bits into new result.
            Common.arraycopy(result, 0, temp, 1, result.length);
            temp[0] = 1;
            result = temp;
        } else {
            result[rstart--] = 1;
        }
    }

    this.value = result;
    this.intLen = resultLen;
    this.offset = result.length - resultLen;
}


/*
 * Calculate the multiplicative inverse of this mod 2^k.
 */
MutableBigInteger.prototype.modInverseMP2 = function (k) {
    if (this.isEven())
        throw new Error("Non-invertible. (GCD != 1)");

    if (k > 64)
        return this.euclidModInverse(k);

    var t = MutableBigInteger.inverseMod32(this.value[this.offset + this.intLen - 1]);

    if (k < 33) {
        t = (k == 32 ? t : t & ((1 << k) - 1));
        return new MutableBigInteger(t);
    }

    var pLong = Long.fromNumber(this.value[this.offset+this.intLen-1] >>> 32);
    if (this.intLen > 1)
        pLong =  pLong.or(Long.fromInt(this.value[this.offset+this.intLen-2] << 32));
    var tLong = Long.fromNumber(t >>> 32);
    tLong = tLong.multiply(Long.fromInt(2).subtract(pLong.multiply(tLong)));  // 1 more Newton iter step
    tLong = (k == 64 ? tLong : tLong.and(
            Long.fromInt(1).shiftLeft(k).subtract(
                Long.fromInt(1)
            )
        )
    );

    var result = new MutableBigInteger(Common.intArray(2));
    result.value[0] = tLong.shiftRightUnsigned(32).low;
    result.value[1] = tLong.low;
    result.intLen = 2;
    result.normalize();
    return result;
}

/**
 * Uses the extended Euclidean algorithm to compute the modInverse of base
 * mod a modulus that is a power of 2. The modulus is 2^k.
 */
MutableBigInteger.prototype.euclidModInverse = function (k) {
    var b = new MutableBigInteger(1);
    b.leftShift(k);
    var mod = new MutableBigInteger(b);

    var a = new MutableBigInteger(this);
    var q = new MutableBigInteger();
    var r = b.divide(a, q);

    var swapper = b;
    // swap b & r
    b = r;
    r = swapper;

    var t1 = new MutableBigInteger(q);
    var t0 = new MutableBigInteger(1);
    var temp = new MutableBigInteger();

    while (!b.isOne()) {
        r = a.divide(b, q);

        if (r.intLen == 0)
            throw new Error("BigIntegerTest not invertible.");

        swapper = r;
        a = swapper;

        if (q.intLen == 1)
            t1.mul(q.value[q.offset], temp);
        else
            q.multiply(t1, temp);
        swapper = q;
        q = temp;
        temp = swapper;
        t0.add(q);

        if (a.isOne())
            return t0;

        r = b.divide(a, q);

        if (r.intLen == 0)
            throw new Error("BigIntegerTest not invertible.");

        swapper = b;
        b =  r;

        if (q.intLen == 1)
            t0.mul(q.value[q.offset], temp);
        else
            q.multiply(t0, temp);
        swapper = q; q = temp; temp = swapper;

        t1.add(q);
    }
    mod.subtract(t1);
    return mod;
}

/**
* Returns the modInverse of this mod p. This and p are not affected by
* the operation.
*/
MutableBigInteger.prototype.mutableModInverse = function (p) {
  // Modulus is odd, use Schroeppel's algorithm
  if (p.isOdd()) {
    return this.modInverse(p);
  }

  // Base and modulus are even, throw exception
  if (this.isEven())
      throw new Error("BigInteger not invertible.");

  // Get even part of modulus expressed as a power of 2
  var powersOf2 = p.getLowestSetBit();

  // // Construct odd part of modulus
  var oddMod = new MutableBigInteger(p);
  oddMod.rightShift(powersOf2);

  if (oddMod.isOne())
    return this.modInverseMP2(powersOf2);

  // Calculate 1/a mod oddMod
  var oddPart = this.modInverse(oddMod);

  // Calculate 1/a mod evenMod
  var evenPart = this.modInverseMP2(powersOf2);

  // Combine the results using Chinese Remainder Theorem
  var y1 = this.modInverseBP2(oddMod, powersOf2);
  var y2 = oddMod.modInverseMP2(powersOf2);

  var temp1 = new MutableBigInteger();
  var temp2 = new MutableBigInteger();
  var result = new MutableBigInteger();

  oddPart.leftShift(powersOf2);
  oddPart.multiply(y1, result);

  evenPart.multiply(oddMod, temp1);
  temp1.multiply(y2, temp2);

  result.add(temp2);
  return result.divide(p, temp1);
}

////

function SignedMutableBigInteger(val) {
  if (typeof val === 'undefined') {
    this.value = [0];
    this.intLen = 0;
  } else if (typeof val === 'number') {
    this.value = [0];
    this.intLen = 1;
    this.value[0] = val;
  }
  this.sign = 1;
  this.offset = 0;
}

util.inherits(SignedMutableBigInteger, MutableBigInteger);

/**
 * Signed addition built upon unsigned add and subtract.
 */
SignedMutableBigInteger.prototype.signedAdd = function (addend) {
  if (addend.constructor.name === 'SignedMutableBigInteger') {
    if (this.sign == addend.sign)
      this.add(addend);
    else
      this.sign = this.sign * this.subtract(addend);
  } else if (addend.constructor.name === 'MutableBigInteger') {
    if (this.sign == 1)
      this.add(addend);
    else
      this.sign = this.sign * this.subtract(addend);
  }
}


SignedMutableBigInteger.prototype.signedSubtract = function(addend) {
  if (addend.constructor.name === 'SignedMutableBigInteger') {
    if (this.sign == addend.sign)
      this.sign = this.sign * this.subtract(addend);
    else
    this.add(addend);  
  } else if (addend.constructor.name === 'MutableBigInteger') {
    if (this.sign == 1)
      this.sign = this.sign * this.subtract(addend);
    else
      this.add(addend);
    if (this.intLen == 0)
      this.sign = 1;
  }
}

module.exports = MutableBigInteger;


},{"./BigIntegerLib":13,"./Integer":14,"./common":16,"long":19,"util":10}],16:[function(require,module,exports){
var Long = require('long');
var Integer = require('./Integer');

exports.copyOfRange = function (original, from, to) {
  var newLength = to - from;
  if (newLength < 0)
      throw new Error(from + " > " + to);
  var copy = new Array(newLength);
  arraycopy(original, from, copy, 0, Math.min(original.length - from, newLength));
  return copy;
}

var arraycopy = exports.arraycopy = function (src, srcPos, dest, destPos, length) {
  for (var i = srcPos; i < (srcPos + length); i++) {
    dest[destPos++] = src[i];
  }
};

var intArray = exports.intArray = function (length) {
  var array = new Array(length);
  for (var i = 0; i < length; i++) {
    array[i] = 0;
  }
  return array;
};

exports.copyOf = function (original, newLength) {
  var copy = intArray(newLength);
  arraycopy(original, 0, copy, 0, Math.min(original.length, newLength));
  return copy;
}

exports.longString = function (i, radix) {
  if (radix < 2 || radix > 36)
    radix = 10;
  if (radix === 10)
    return i.toString();
  var buf = new Array(65);
  var charPos = 64;
  var negative = i.compare(Long.ZERO) < 0;

  if (!negative) {
    i = i.negate();
  }
  radix = Long.fromInt(radix);
  var _radix = radix.negate();
  while (i.compare(_radix) <= 0) {
    var rem = i.subtract(i.div(radix).multiply(radix));
    buf[charPos--] = Integer.digits[rem.negate().low];
    i = i.div(radix);
  }
  buf[charPos] = Integer.digits[i.negate().low];

  if (negative) {
    buf[--charPos] = '-';
  }
  return exports.copyOfRange(buf, charPos, 65).join('');
};

exports.debug = function (a,b,c,d,e,f) {
  console.log(a,
    JSON.stringify(b),
    JSON.stringify(c),
    JSON.stringify(d),
    JSON.stringify(e),
    JSON.stringify(f)
  );
}
},{"./Integer":14,"long":19}],17:[function(require,module,exports){
(function (Buffer){
'use strict';

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

// shim for Node's 'util' package
// DO NOT REMOVE THIS! It is required for compatibility with EnderJS (http://enderjs.com/).
var util = {
  isArray: function (ar) {
    return Array.isArray(ar) || (typeof ar === 'object' && objectToString(ar) === '[object Array]');
  },
  isDate: function (d) {
    return typeof d === 'object' && objectToString(d) === '[object Date]';
  },
  isRegExp: function (re) {
    return typeof re === 'object' && objectToString(re) === '[object RegExp]';
  },
  getRegExpFlags: function (re) {
    var flags = '';
    re.global && (flags += 'g');
    re.ignoreCase && (flags += 'i');
    re.multiline && (flags += 'm');
    return flags;
  }
};


if (typeof module === 'object')
  module.exports = clone;

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
*/

function clone(parent, circular, depth, prototype) {
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  var allParents = [];
  var allChildren = [];

  var useBuffer = typeof Buffer != 'undefined';

  if (typeof circular == 'undefined')
    circular = true;

  if (typeof depth == 'undefined')
    depth = Infinity;

  // recurse this function so we don't reset allParents and allChildren
  function _clone(parent, depth) {
    // cloning null always returns null
    if (parent === null)
      return null;

    if (depth == 0)
      return parent;

    var child;
    var proto;
    if (typeof parent != 'object') {
      return parent;
    }

    if (util.isArray(parent)) {
      child = [];
    } else if (util.isRegExp(parent)) {
      child = new RegExp(parent.source, util.getRegExpFlags(parent));
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
    } else if (util.isDate(parent)) {
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      child = new Buffer(parent.length);
      parent.copy(child);
      return child;
    } else {
      if (typeof prototype == 'undefined') {
        proto = Object.getPrototypeOf(parent);
        child = Object.create(proto);
      }
      else {
        child = Object.create(prototype);
        proto = prototype;
      }
    }

    if (circular) {
      var index = allParents.indexOf(parent);

      if (index != -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    for (var i in parent) {
      var attrs;
      if (proto) {
        attrs = Object.getOwnPropertyDescriptor(proto, i);
      }
      
      if (attrs && attrs.set == null) {
        continue;
      }
      child[i] = _clone(parent[i], depth - 1);
    }

    return child;
  }

  return _clone(parent, depth);
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

}).call(this,require("buffer").Buffer)

},{"buffer":3}],18:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license Long.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/Long.js for details
 */
(function(global) {
    "use strict";

    /**
     * Constructs a 64 bit two's-complement integer, given its low and high 32 bit values as *signed* integers.
     *  See the from* functions below for more convenient ways of constructing Longs.
     * @exports Long
     * @class A Long class for representing a 64 bit two's-complement integer value.
     * @param {number} low The low (signed) 32 bits of the long
     * @param {number} high The high (signed) 32 bits of the long
     * @param {boolean=} unsigned Whether unsigned or not, defaults to `false` for signed
     * @constructor
     */
    var Long = function(low, high, unsigned) {

        /**
         * The low 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.low = low|0;

        /**
         * The high 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.high = high|0;

        /**
         * Whether unsigned or not.
         * @type {boolean}
         * @expose
         */
        this.unsigned = !!unsigned;
    };

    // The internal representation of a long is the two given signed, 32-bit values.
    // We use 32-bit pieces because these are the size of integers on which
    // Javascript performs bit-operations.  For operations like addition and
    // multiplication, we split each number into 16 bit pieces, which can easily be
    // multiplied within Javascript's floating-point representation without overflow
    // or change in sign.
    //
    // In the algorithms below, we frequently reduce the negative case to the
    // positive case by negating the input(s) and then post-processing the result.
    // Note that we must ALWAYS check specially whether those values are MIN_VALUE
    // (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
    // a positive number, it overflows back into a negative).  Not handling this
    // case would often result in infinite recursion.
    //
    // Common constant values ZERO, ONE, NEG_ONE, etc. are defined below the from*
    // methods on which they depend.

    /**
     * Tests if the specified object is a Long.
     * @param {*} obj Object
     * @returns {boolean}
     * @expose
     */
    Long.isLong = function(obj) {
        return (obj && obj instanceof Long) === true;
    };

    /**
     * A cache of the Long representations of small integer values.
     * @type {!Object}
     * @inner
     */
    var INT_CACHE = {};

    /**
     * A cache of the Long representations of small unsigned integer values.
     * @type {!Object}
     * @inner
     */
    var UINT_CACHE = {};

    /**
     * Returns a Long representing the given 32 bit integer value.
     * @param {number} value The 32 bit integer in question
     * @param {boolean=} unsigned Whether unsigned or not, defaults to `false` for signed
     * @returns {!Long} The corresponding Long value
     * @expose
     */
    Long.fromInt = function(value, unsigned) {
        var obj, cachedObj;
        if (!unsigned) {
            value = value | 0;
            if (-128 <= value && value < 128) {
                cachedObj = INT_CACHE[value];
                if (cachedObj)
                    return cachedObj;
            }
            obj = new Long(value, value < 0 ? -1 : 0, false);
            if (-128 <= value && value < 128)
                INT_CACHE[value] = obj;
            return obj;
        } else {
            value = value >>> 0;
            if (0 <= value && value < 256) {
                cachedObj = UINT_CACHE[value];
                if (cachedObj)
                    return cachedObj;
            }
            obj = new Long(value, (value | 0) < 0 ? -1 : 0, true);
            if (0 <= value && value < 256)
                UINT_CACHE[value] = obj;
            return obj;
        }
    };

    /**
     * Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
     * @param {number} value The number in question
     * @param {boolean=} unsigned Whether unsigned or not, defaults to `false` for signed
     * @returns {!Long} The corresponding Long value
     * @expose
     */
    Long.fromNumber = function(value, unsigned) {
        unsigned = !!unsigned;
        if (isNaN(value) || !isFinite(value))
            return Long.ZERO;
        if (!unsigned && value <= -TWO_PWR_63_DBL)
            return Long.MIN_VALUE;
        if (!unsigned && value + 1 >= TWO_PWR_63_DBL)
            return Long.MAX_VALUE;
        if (unsigned && value >= TWO_PWR_64_DBL)
            return Long.MAX_UNSIGNED_VALUE;
        if (value < 0)
            return Long.fromNumber(-value, unsigned).negate();
        return new Long((value % TWO_PWR_32_DBL) | 0, (value / TWO_PWR_32_DBL) | 0, unsigned);
    };

    /**
     * Returns a Long representing the 64 bit integer that comes by concatenating the given low and high bits. Each is
     *  assumed to use 32 bits.
     * @param {number} lowBits The low 32 bits
     * @param {number} highBits The high 32 bits
     * @param {boolean=} unsigned Whether unsigned or not, defaults to `false` for signed
     * @returns {!Long} The corresponding Long value
     * @expose
     */
    Long.fromBits = function(lowBits, highBits, unsigned) {
        return new Long(lowBits, highBits, unsigned);
    };

    /**
     * Returns a Long representation of the given string, written using the specified radix.
     * @param {string} str The textual representation of the Long
     * @param {(boolean|number)=} unsigned Whether unsigned or not, defaults to `false` for signed
     * @param {number=} radix The radix in which the text is written (2-36), defaults to 10
     * @returns {!Long} The corresponding Long value
     * @expose
     */
    Long.fromString = function(str, unsigned, radix) {
        if (str.length === 0)
            throw Error('number format error: empty string');
        if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity")
            return Long.ZERO;
        if (typeof unsigned === 'number') // For goog.math.long compatibility
            radix = unsigned,
            unsigned = false;
        radix = radix || 10;
        if (radix < 2 || 36 < radix)
            throw Error('radix out of range: ' + radix);

        var p;
        if ((p = str.indexOf('-')) > 0)
            throw Error('number format error: interior "-" character: ' + str);
        else if (p === 0)
            return Long.fromString(str.substring(1), unsigned, radix).negate();

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 8));

        var result = Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(Long.fromNumber(value));
            }
        }
        result.unsigned = unsigned;
        return result;
    };

    /**
     * Converts the specified value to a Long.
     * @param {!Long|number|string|!{low: number, high: number, unsigned: boolean}} val Value
     * @returns {!Long}
     * @expose
     */
    Long.fromValue = function(val) {
        if (typeof val === 'number')
            return Long.fromNumber(val);
        if (typeof val === 'string')
            return Long.fromString(val);
        if (Long.isLong(val))
            return val;
        // Throws for not an object (undefined, null):
        return new Long(val.low, val.high, val.unsigned);
    };

    // NOTE: the compiler should inline these constant values below and then remove these variables, so there should be
    // no runtime penalty for these.

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_16_DBL = 1 << 16;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_24_DBL = 1 << 24;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_31_DBL = TWO_PWR_32_DBL / 2;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_48_DBL = TWO_PWR_32_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;

    /**
     * @type {number}
     * @inner
     */
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;

    /**
     * @type {!Long}
     * @inner
     */
    var TWO_PWR_24 = Long.fromInt(1 << 24);

    /**
     * Signed zero.
     * @type {!Long}
     * @expose
     */
    Long.ZERO = Long.fromInt(0);

    /**
     * Unsigned zero.
     * @type {!Long}
     * @expose
     */
    Long.UZERO = Long.fromInt(0, true);

    /**
     * Signed one.
     * @type {!Long}
     * @expose
     */
    Long.ONE = Long.fromInt(1);

    /**
     * Unsigned one.
     * @type {!Long}
     * @expose
     */
    Long.UONE = Long.fromInt(1, true);

    /**
     * Signed negative one.
     * @type {!Long}
     * @expose
     */
    Long.NEG_ONE = Long.fromInt(-1);

    /**
     * Maximum signed value.
     * @type {!Long}
     * @expose
     */
    Long.MAX_VALUE = Long.fromBits(0xFFFFFFFF|0, 0x7FFFFFFF|0, false);

    /**
     * Maximum unsigned value.
     * @type {!Long}
     * @expose
     */
    Long.MAX_UNSIGNED_VALUE = Long.fromBits(0xFFFFFFFF|0, 0xFFFFFFFF|0, true);

    /**
     * Minimum signed value.
     * @type {!Long}
     * @expose
     */
    Long.MIN_VALUE = Long.fromBits(0, 0x80000000|0, false);

    /**
     * Converts the Long to a 32 bit integer, assuming it is a 32 bit integer.
     * @returns {number}
     * @expose
     */
    Long.prototype.toInt = function() {
        return this.unsigned ? this.low >>> 0 : this.low;
    };

    /**
     * Converts the Long to a the nearest floating-point representation of this value (double, 53 bit mantissa).
     * @returns {number}
     * @expose
     */
    Long.prototype.toNumber = function() {
        if (this.unsigned) {
            return ((this.high >>> 0) * TWO_PWR_32_DBL) + (this.low >>> 0);
        }
        return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };

    /**
     * Converts the Long to a string written in the specified radix.
     * @param {number=} radix Radix (2-36), defaults to 10
     * @returns {string}
     * @override
     * @throws {RangeError} If `radix` is out of range
     * @expose
     */
    Long.prototype.toString = function(radix) {
        radix = radix || 10;
        if (radix < 2 || 36 < radix)
            throw RangeError('radix out of range: ' + radix);
        if (this.isZero())
            return '0';
        var rem;
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = Long.fromNumber(radix);
                var div = this.div(radixLong);
                rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else
                return '-' + this.negate().toString(radix);
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 6), this.unsigned);
        rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower),
                intval = rem.subtract(remDiv.multiply(radixToPower)).toInt() >>> 0,
                digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero())
                return digits + result;
            else {
                while (digits.length < 6)
                    digits = '0' + digits;
                result = '' + digits + result;
            }
        }
    };

    /**
     * Gets the high 32 bits as a signed integer.
     * @returns {number} Signed high bits
     * @expose
     */
    Long.prototype.getHighBits = function() {
        return this.high;
    };

    /**
     * Gets the high 32 bits as an unsigned integer.
     * @returns {number} Unsigned high bits
     * @expose
     */
    Long.prototype.getHighBitsUnsigned = function() {
        return this.high >>> 0;
    };

    /**
     * Gets the low 32 bits as a signed integer.
     * @returns {number} Signed low bits
     * @expose
     */
    Long.prototype.getLowBits = function() {
        return this.low;
    };

    /**
     * Gets the low 32 bits as an unsigned integer.
     * @returns {number} Unsigned low bits
     * @expose
     */
    Long.prototype.getLowBitsUnsigned = function() {
        return this.low >>> 0;
    };

    /**
     * Gets the number of bits needed to represent the absolute value of this Long.
     * @returns {number}
     * @expose
     */
    Long.prototype.getNumBitsAbs = function() {
        if (this.isNegative()) // Unsigned Longs are never negative
            return this.equals(Long.MIN_VALUE) ? 64 : this.negate().getNumBitsAbs();
        var val = this.high != 0 ? this.high : this.low;
        for (var bit = 31; bit > 0; bit--)
            if ((val & (1 << bit)) != 0)
                break;
        return this.high != 0 ? bit + 33 : bit + 1;
    };

    /**
     * Tests if this Long's value equals zero.
     * @returns {boolean}
     * @expose
     */
    Long.prototype.isZero = function() {
        return this.high === 0 && this.low === 0;
    };

    /**
     * Tests if this Long's value is negative.
     * @returns {boolean}
     * @expose
     */
    Long.prototype.isNegative = function() {
        return !this.unsigned && this.high < 0;
    };

    /**
     * Tests if this Long's value is positive.
     * @returns {boolean}
     * @expose
     */
    Long.prototype.isPositive = function() {
        return this.unsigned || this.high >= 0;
    };

    /**
     * Tests if this Long's value is odd.
     * @returns {boolean}
     * @expose
     */
    Long.prototype.isOdd = function() {
        return (this.low & 1) === 1;
    };

    /**
     * Tests if this Long's value is even.
     * @returns {boolean}
     */
    Long.prototype.isEven = function() {
        return (this.low & 1) === 0;
    };

    /**
     * Tests if this Long's value equals the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.equals = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        if (this.unsigned !== other.unsigned && (this.high >>> 31) !== (other.high >>> 31))
            return false;
        return this.high === other.high && this.low === other.low;
    };

    /**
     * Tests if this Long's value differs from the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.notEquals = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return !this.equals(other);
    };

    /**
     * Tests if this Long's value is less than the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.lessThan = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return this.compare(other) < 0;
    };

    /**
     * Tests if this Long's value is less than or equal the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.lessThanOrEqual = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return this.compare(other) <= 0;
    };

    /**
     * Tests if this Long's value is greater than the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.greaterThan = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return this.compare(other) > 0;
    };

    /**
     * Tests if this Long's value is greater than or equal the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {boolean}
     * @expose
     */
    Long.prototype.greaterThanOrEqual = function(other) {
        return this.compare(other) >= 0;
    };

    /**
     * Compares this Long's value with the specified's.
     * @param {!Long|number|string} other Other value
     * @returns {number} 0 if they are the same, 1 if the this is greater and -1
     *  if the given one is greater
     * @expose
     */
    Long.prototype.compare = function(other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) return -1;
        if (!thisNeg && otherNeg) return 1;
        // At this point the sign bits are the same
        if (!this.unsigned)
            return this.subtract(other).isNegative() ? -1 : 1;
        // Both are positive if at least one is unsigned
        return (other.high >>> 0) > (this.high >>> 0) || (other.high === this.high && (other.low >>> 0) > (this.low >>> 0)) ? -1 : 1;
    };

    /**
     * Negates this Long's value.
     * @returns {!Long} Negated Long
     * @expose
     */
    Long.prototype.negate = function() {
        if (!this.unsigned && this.equals(Long.MIN_VALUE))
            return Long.MIN_VALUE;
        return this.not().add(Long.ONE);
    };

    /**
     * Returns the sum of this and the specified Long.
     * @param {!Long|number|string} addend Addend
     * @returns {!Long} Sum
     * @expose
     */
    Long.prototype.add = function(addend) {
        if (!Long.isLong(addend))
            addend = Long.fromValue(addend);

        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.

        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = addend.high >>> 16;
        var b32 = addend.high & 0xFFFF;
        var b16 = addend.low >>> 16;
        var b00 = addend.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns the difference of this and the specified Long.
     * @param {!Long|number|string} subtrahend Subtrahend
     * @returns {!Long} Difference
     * @expose
     */
    Long.prototype.subtract = function(subtrahend) {
        if (!Long.isLong(subtrahend))
            subtrahend = Long.fromValue(subtrahend);
        return this.add(subtrahend.negate());
    };

    /**
     * Returns the product of this and the specified Long.
     * @param {!Long|number|string} multiplier Multiplier
     * @returns {!Long} Product
     * @expose
     */
    Long.prototype.multiply = function(multiplier) {
        if (this.isZero())
            return Long.ZERO;
        if (!Long.isLong(multiplier))
            multiplier = Long.fromValue(multiplier);
        if (multiplier.isZero())
            return Long.ZERO;
        if (this.equals(Long.MIN_VALUE))
            return multiplier.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        if (multiplier.equals(Long.MIN_VALUE))
            return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;

        if (this.isNegative()) {
            if (multiplier.isNegative())
                return this.negate().multiply(multiplier.negate());
            else
                return this.negate().multiply(multiplier).negate();
        } else if (multiplier.isNegative())
            return this.multiply(multiplier.negate()).negate();

        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24) && multiplier.lessThan(TWO_PWR_24))
            return Long.fromNumber(this.toNumber() * multiplier.toNumber(), this.unsigned);

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.

        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = multiplier.high >>> 16;
        var b32 = multiplier.high & 0xFFFF;
        var b16 = multiplier.low >>> 16;
        var b00 = multiplier.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns this Long divided by the specified.
     * @param {!Long|number|string} divisor Divisor
     * @returns {!Long} Quotient
     * @expose
     */
    Long.prototype.div = function(divisor) {
        if (!Long.isLong(divisor))
            divisor = Long.fromValue(divisor);
        if (divisor.isZero())
            throw(new Error('division by zero'));
        if (this.isZero())
            return this.unsigned ? Long.UZERO : Long.ZERO;
        var approx, rem, res;
        if (this.equals(Long.MIN_VALUE)) {
            if (divisor.equals(Long.ONE) || divisor.equals(Long.NEG_ONE))
                return Long.MIN_VALUE;  // recall that -MIN_VALUE == MIN_VALUE
            else if (divisor.equals(Long.MIN_VALUE))
                return Long.ONE;
            else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                approx = halfThis.div(divisor).shiftLeft(1);
                if (approx.equals(Long.ZERO)) {
                    return divisor.isNegative() ? Long.ONE : Long.NEG_ONE;
                } else {
                    rem = this.subtract(divisor.multiply(approx));
                    res = approx.add(rem.div(divisor));
                    return res;
                }
            }
        } else if (divisor.equals(Long.MIN_VALUE))
            return this.unsigned ? Long.UZERO : Long.ZERO;
        if (this.isNegative()) {
            if (divisor.isNegative())
                return this.negate().div(divisor.negate());
            return this.negate().div(divisor).negate();
        } else if (divisor.isNegative())
            return this.div(divisor.negate()).negate();

        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        res = Long.ZERO;
        rem = this;
        while (rem.greaterThanOrEqual(divisor)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            approx = Math.max(1, Math.floor(rem.toNumber() / divisor.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2),
                delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48),

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
                approxRes = Long.fromNumber(approx),
                approxRem = approxRes.multiply(divisor);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = Long.fromNumber(approx, this.unsigned);
                approxRem = approxRes.multiply(divisor);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero())
                approxRes = Long.ONE;

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
     * Returns this Long modulo the specified.
     * @param {!Long|number|string} divisor Divisor
     * @returns {!Long} Remainder
     * @expose
     */
    Long.prototype.modulo = function(divisor) {
        if (!Long.isLong(divisor))
            divisor = Long.fromValue(divisor);
        return this.subtract(this.div(divisor).multiply(divisor));
    };

    /**
     * Returns the bitwise NOT of this Long.
     * @returns {!Long}
     * @expose
     */
    Long.prototype.not = function() {
        return Long.fromBits(~this.low, ~this.high, this.unsigned);
    };

    /**
     * Returns the bitwise AND of this Long and the specified.
     * @param {!Long|number|string} other Other Long
     * @returns {!Long}
     * @expose
     */
    Long.prototype.and = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };

    /**
     * Returns the bitwise OR of this Long and the specified.
     * @param {!Long|number|string} other Other Long
     * @returns {!Long}
     * @expose
     */
    Long.prototype.or = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };

    /**
     * Returns the bitwise XOR of this Long and the given one.
     * @param {!Long|number|string} other Other Long
     * @returns {!Long}
     * @expose
     */
    Long.prototype.xor = function(other) {
        if (!Long.isLong(other))
            other = Long.fromValue(other);
        return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the left by the given amount.
     * @param {number|!Long} numBits Number of bits
     * @returns {!Long} Shifted Long
     * @expose
     */
    Long.prototype.shiftLeft = function(numBits) {
        if (Long.isLong(numBits))
            numBits = numBits.toInt();
        if ((numBits &= 63) === 0)
            return this;
        else if (numBits < 32)
            return Long.fromBits(this.low << numBits, (this.high << numBits) | (this.low >>> (32 - numBits)), this.unsigned);
        else
            return Long.fromBits(0, this.low << (numBits - 32), this.unsigned);
    };

    /**
     * Returns this Long with bits arithmetically shifted to the right by the given amount.
     * @param {number|!Long} numBits Number of bits
     * @returns {!Long} Shifted Long
     * @expose
     */
    Long.prototype.shiftRight = function(numBits) {
        if (Long.isLong(numBits))
            numBits = numBits.toInt();
        if ((numBits &= 63) === 0)
            return this;
        else if (numBits < 32)
            return Long.fromBits((this.low >>> numBits) | (this.high << (32 - numBits)), this.high >> numBits, this.unsigned);
        else
            return Long.fromBits(this.high >> (numBits - 32), this.high >= 0 ? 0 : -1, this.unsigned);
    };

    /**
     * Returns this Long with bits logically shifted to the right by the given amount.
     * @param {number|!Long} numBits Number of bits
     * @returns {!Long} Shifted Long
     * @expose
     */
    Long.prototype.shiftRightUnsigned = function(numBits) {
        if (Long.isLong(numBits))
            numBits = numBits.toInt();
        numBits &= 63;
        if (numBits === 0)
            return this;
        else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits, this.unsigned);
            } else if (numBits === 32)
                return Long.fromBits(high, 0, this.unsigned);
            else
                return Long.fromBits(high >>> (numBits - 32), 0, this.unsigned);
        }
    };

    /**
     * Converts this Long to signed.
     * @returns {!Long} Signed long
     * @expose
     */
    Long.prototype.toSigned = function() {
        if (!this.unsigned)
            return this;
        return new Long(this.low, this.high, false);
    };

    /**
     * Converts this Long to unsigned.
     * @returns {!Long} Unsigned long
     * @expose
     */
    Long.prototype.toUnsigned = function() {
        if (this.unsigned)
            return this;
        return new Long(this.low, this.high, true);
    };

    /* CommonJS */ if (typeof module !== 'undefined' && module["exports"])
        module["exports"] = Long;
    /* AMD */ else if (typeof define === 'function' && define["amd"])
        define(function() { return Long; });
    /* Global */ else
        (global["dcodeIO"] = global["dcodeIO"] || {})["Long"] = Long;

})(this);

},{}],19:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

module.exports = require("./dist/Long.js");

},{"./dist/Long.js":18}],20:[function(require,module,exports){
(function (process,Buffer){
!function(globals){
'use strict'

//*** UMD BEGIN
if (typeof define !== 'undefined' && define.amd) { //require.js / AMD
  define([], function() {
    return secureRandom
  })
} else if (typeof module !== 'undefined' && module.exports) { //CommonJS
  module.exports = secureRandom
} else { //script / browser
  globals.secureRandom = secureRandom
}
//*** UMD END

//options.type is the only valid option
function secureRandom(count, options) {
  options = options || {type: 'Array'}
  //we check for process.pid to prevent browserify from tricking us
  if (typeof process != 'undefined' && typeof process.pid == 'number') {
    return nodeRandom(count, options)
  } else {
    var crypto = window.crypto || window.msCrypto
    if (!crypto) throw new Error("Your browser does not support window.crypto.")
    return browserRandom(count, options)
  }
}

function nodeRandom(count, options) {
  var crypto = require('crypto')
  var buf = crypto.randomBytes(count)

  switch (options.type) {
    case 'Array':
      return [].slice.call(buf)
    case 'Buffer':
      return buf
    case 'Uint8Array':
      var arr = new Uint8Array(count)
      for (var i = 0; i < count; ++i) { arr[i] = buf.readUInt8(i) }
      return arr
    default:
      throw new Error(options.type + " is unsupported.")
  }
}

function browserRandom(count, options) {
  var nativeArr = new Uint8Array(count)
  var crypto = window.crypto || window.msCrypto
  crypto.getRandomValues(nativeArr)

  switch (options.type) {
    case 'Array':
      return [].slice.call(nativeArr)
    case 'Buffer':
      try { var b = new Buffer(1) } catch(e) { throw new Error('Buffer not supported in this environment. Use Node.js or Browserify for browser support.')}
      return new Buffer(nativeArr)
    case 'Uint8Array':
      return nativeArr
    default:
      throw new Error(options.type + " is unsupported.")
  }
}

secureRandom.randomArray = function(byteCount) {
  return secureRandom(byteCount, {type: 'Array'})
}

secureRandom.randomUint8Array = function(byteCount) {
  return secureRandom(byteCount, {type: 'Uint8Array'})
}

secureRandom.randomBuffer = function(byteCount) {
  return secureRandom(byteCount, {type: 'Buffer'})
}


}(this);

}).call(this,require('_process'),require("buffer").Buffer)

},{"_process":8,"buffer":3,"crypto":2}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL1VzZXJzL9CQ0LTQvNC40L3QuNGB0YLRgNCw0YLQvtGAL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImJsaW5kLmpzIiwiLi4vLi4vVXNlcnMv0JDQtNC80LjQvdC40YHRgtGA0LDRgtC+0YAvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwiLi4vLi4vVXNlcnMv0JDQtNC80LjQvdC40YHRgtGA0LDRgtC+0YAvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzIiwiLi4vLi4vVXNlcnMv0JDQtNC80LjQvdC40YHRgtGA0LDRgtC+0YAvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qcyIsIi4uLy4uL1VzZXJzL9CQ0LTQvNC40L3QuNGB0YLRgNCw0YLQvtGAL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi4uLy4uL1VzZXJzL9CQ0LTQvNC40L3QuNGB0YLRgNCw0YLQvtGAL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaXMtYXJyYXkvaW5kZXguanMiLCIuLi8uLi9Vc2Vycy/QkNC00LzQuNC90LjRgdGC0YDQsNGC0L7RgC9BcHBEYXRhL1JvYW1pbmcvbnBtL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwiLi4vLi4vVXNlcnMv0JDQtNC80LjQvdC40YHRgtGA0LDRgtC+0YAvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiLi4vLi4vVXNlcnMv0JDQtNC80LjQvdC40YHRgtGA0LDRgtC+0YAvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIi4uLy4uL1VzZXJzL9CQ0LTQvNC40L3QuNGB0YLRgNCw0YLQvtGAL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9ub2RlLWJpZ2ludGVnZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbm9kZS1iaWdpbnRlZ2VyL2xpYi9CaWdJbnRlZ2VyLmpzIiwibm9kZV9tb2R1bGVzL25vZGUtYmlnaW50ZWdlci9saWIvQmlnSW50ZWdlckxpYi5qcyIsIm5vZGVfbW9kdWxlcy9ub2RlLWJpZ2ludGVnZXIvbGliL0ludGVnZXIuanMiLCJub2RlX21vZHVsZXMvbm9kZS1iaWdpbnRlZ2VyL2xpYi9NdXRhYmxlQmlnSW50ZWdlci5qcyIsIm5vZGVfbW9kdWxlcy9ub2RlLWJpZ2ludGVnZXIvbGliL2NvbW1vbi5qcyIsIm5vZGVfbW9kdWxlcy9ub2RlLWJpZ2ludGVnZXIvbm9kZV9tb2R1bGVzL2Nsb25lL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL25vZGUtYmlnaW50ZWdlci9ub2RlX21vZHVsZXMvbG9uZy9kaXN0L0xvbmcuanMiLCJub2RlX21vZHVsZXMvbm9kZS1iaWdpbnRlZ2VyL25vZGVfbW9kdWxlcy9sb25nL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3NlY3VyZS1yYW5kb20vbGliL3NlY3VyZS1yYW5kb20uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDMUVBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdDRDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzFrQkE7OztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNuOERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNocENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2w3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgQmlnSW50ZWdlciA9IHJlcXVpcmUoJ25vZGUtYmlnaW50ZWdlcicpO1xyXG52YXIgU2VjdXJlUmFuZG9tID0gcmVxdWlyZSgnc2VjdXJlLXJhbmRvbScpO1xyXG5cclxuZ2xvYmFsLmJpZ0ludEZyb21TdHJpbmcgPSBmdW5jdGlvbihzdHJpbmcpIHtcclxuXHRyZXR1cm4gQmlnSW50ZWdlci5mcm9tU3RyaW5nKHN0cmluZyk7XHJcbn1cclxuXHJcbmdsb2JhbC5iaWdJbnRGcm9tTG9uZyA9IGZ1bmN0aW9uKGxvbmcpIHtcclxuXHRyZXR1cm4gQmlnSW50ZWdlci5mcm9tTG9uZyhsb25nKTtcclxufVxyXG5cclxuZ2xvYmFsLmJpZ0ludEZyb21NZXNzYWdlID0gZnVuY3Rpb24obWVzc2FnZSkge1xyXG5cdHZhciBieXRlcyA9IFtdO1xyXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbWVzc2FnZS5sZW5ndGg7IGkrKylcclxuXHR7XHJcbiAgICBcdGJ5dGVzLnB1c2gobWVzc2FnZS5jaGFyQ29kZUF0KGkpKTtcclxuXHR9XHJcblx0cmV0dXJuIEJpZ0ludGVnZXIuZnJvbUJ1ZmZlcigxLCBieXRlcyk7XHJcbn1cclxuXHJcbi8vIEJsaW5kIG1lc3NhZ2UgYnkgQWxpY2VcclxuZ2xvYmFsLmJsaW5kTWVzc2FnZSA9IGZ1bmN0aW9uKG1lc3NhZ2UsIG1hc2tpbmdGYWN0b3IsIGUsIG4pIHtcclxuXHR2YXIgYmxpbmRlZE1lc3NhZ2UgPSAoKG1hc2tpbmdGYWN0b3IubW9kUG93KGUsIG4pKS5tdWx0aXBseShtZXNzYWdlKSkubW9kKG4pO1xyXG5cdHJldHVybiBibGluZGVkTWVzc2FnZTtcclxufVxyXG5cclxuLy8gU2lnbiBtZXNzYWdlIGJ5IEJvYiB3aXRoIGhpcyBwcml2YXRlIGtleVxyXG5nbG9iYWwuc2lnbk1lc3NhZ2UgPSBmdW5jdGlvbihibGluZGVkTWVzc2FnZSwgcHJpdmF0ZUtleSwgbikge1xyXG5cdHZhciBibGluZGVkU2lnbmVkTWVzc2FnZSA9IGJsaW5kZWRNZXNzYWdlLm1vZFBvdyhwcml2YXRlS2V5LCBuKTtcclxuXHRyZXR1cm4gYmxpbmRlZFNpZ25lZE1lc3NhZ2U7XHJcbn1cclxuXHJcbi8vIFVuYmxpbmQgbWVzc2FnZSBmcm9tIHNlcnZlciBieSBBbGljZVxyXG5nbG9iYWwudW5ibGluZE1lc3NhZ2UgPSBmdW5jdGlvbihibGluZGVkU2lnbmVkTWVzc2FnZSwgbWFza2luZ0ZhY3Rvciwgbikge1xyXG5cdHZhciB1bmJsaW5kZWRTaWduZWRNZXNzYWdlID0gbWFza2luZ0ZhY3Rvci5tb2RJbnZlcnNlKG4pLm11bHRpcGx5KGJsaW5kZWRTaWduZWRNZXNzYWdlKS5tb2Qobik7XHJcblx0cmV0dXJuIHVuYmxpbmRlZFNpZ25lZE1lc3NhZ2U7XHJcbn1cclxuXHJcbmdsb2JhbC51bnNpZ25NZXNzYWdlID0gZnVuY3Rpb24oc2lnbmVkTWVzc2FnZSwgZSwgbikge1xyXG5cdHZhciB1bnNpZ25lZE1lc3NhZ2UgPSBzaWduZWRNZXNzYWdlLm1vZFBvdyhlLCBuKTtcclxuXHRyZXR1cm4gdW5zaWduZWRNZXNzYWdlO1xyXG59XHJcblxyXG5nbG9iYWwuc2VjdXJlUmFuZG9tQXJyYXkgPSBmdW5jdGlvbihsZW5ndGgpIHtcclxuXHR2YXIgZGF0YSA9IFNlY3VyZVJhbmRvbS5yYW5kb21BcnJheShsZW5ndGgpO1xyXG5cdHJldHVybiBkYXRhO1xyXG59XHJcblxyXG5nbG9iYWwuYnl0ZUFycmF5VG9CaWdJbnRlZ2VyID0gZnVuY3Rpb24oYnl0ZUFycmF5KSB7XHJcbiAgICB2YXIgdmFsdWUgPSAwO1xyXG4gICAgdmFyIHN0cmluZyA9IFwiXCI7XHJcbiAgICBmb3IgKHZhciBpID0gYnl0ZUFycmF5Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgdmFsdWUgPSAodmFsdWUgKiAyNTYpICsgYnl0ZUFycmF5W2ldO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU51bWJlcih2YWx1ZSk7XHJcbn07XHJcblxyXG5nbG9iYWwuZ2V0TWFza2luZ0ZhY3RvciA9IGZ1bmN0aW9uKHApIHtcclxuXHR2YXIgc2VjdXJlUmFuZG9tID0gU2VjdXJlUmFuZG9tLnJhbmRvbUFycmF5KDUpO1xyXG5cdHZhciBtYXNraW5nRmFjdG9yO1xyXG5cdGRvIHtcclxuXHRcdG1hc2tpbmdGYWN0b3IgPSBnbG9iYWwuYnl0ZUFycmF5VG9CaWdJbnRlZ2VyKHNlY3VyZVJhbmRvbSk7XHJcblx0fSB3aGlsZSAoZ2NkKG1hc2tpbmdGYWN0b3IsIHApICE9IDEpO1xyXG5cdHJldHVybiBtYXNraW5nRmFjdG9yO1xyXG59XHJcblxyXG5nbG9iYWwuZ2NkID0gZnVuY3Rpb24oYSwgYikge1xyXG5cdHZhciB6ZXJvID0gQmlnSW50ZWdlci5mcm9tTnVtYmVyKDApO1xyXG5cdHdoaWxlICh0cnVlKSB7XHJcblx0XHRhID0gYS5tb2QoYik7XHJcblx0XHRpZiAoYS5jb21wYXJlVG8oemVybykgPD0gMCkgcmV0dXJuIGI7XHJcblx0XHRiID0gYi5tb2QoYSk7XHJcblx0XHRpZiAoYi5jb21wYXJlVG8oemVybykgPD0gMCkgcmV0dXJuIGE7XHJcblx0fVxyXG59IixudWxsLCIvKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXMtYXJyYXknKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gU2xvd0J1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyIC8vIG5vdCB1c2VkIGJ5IHRoaXMgaW1wbGVtZW50YXRpb25cblxudmFyIGtNYXhMZW5ndGggPSAweDNmZmZmZmZmXG52YXIgcm9vdFBhcmVudCA9IHt9XG5cbi8qKlxuICogSWYgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKG1vc3QgY29tcGF0aWJsZSwgZXZlbiBJRTYpXG4gKlxuICogQnJvd3NlcnMgdGhhdCBzdXBwb3J0IHR5cGVkIGFycmF5cyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLCBDaHJvbWUgNyssIFNhZmFyaSA1LjErLFxuICogT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICpcbiAqIE5vdGU6XG4gKlxuICogLSBJbXBsZW1lbnRhdGlvbiBtdXN0IHN1cHBvcnQgYWRkaW5nIG5ldyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMuXG4gKiAgIEZpcmVmb3ggNC0yOSBsYWNrZWQgc3VwcG9ydCwgZml4ZWQgaW4gRmlyZWZveCAzMCsuXG4gKiAgIFNlZTogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4LlxuICpcbiAqICAtIENocm9tZSA5LTEwIGlzIG1pc3NpbmcgdGhlIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24uXG4gKlxuICogIC0gSUUxMCBoYXMgYSBicm9rZW4gYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbiB3aGljaCByZXR1cm5zIGFycmF5cyBvZlxuICogICAgaW5jb3JyZWN0IGxlbmd0aCBpbiBzb21lIHNpdHVhdGlvbnMuXG4gKlxuICogV2UgZGV0ZWN0IHRoZXNlIGJ1Z2d5IGJyb3dzZXJzIGFuZCBzZXQgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYCB0byBgZmFsc2VgIHNvIHRoZXkgd2lsbFxuICogZ2V0IHRoZSBPYmplY3QgaW1wbGVtZW50YXRpb24sIHdoaWNoIGlzIHNsb3dlciBidXQgd2lsbCB3b3JrIGNvcnJlY3RseS5cbiAqL1xuQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgPSAoZnVuY3Rpb24gKCkge1xuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIGFyci5mb28oKSA9PT0gNDIgJiYgLy8gdHlwZWQgYXJyYXkgaW5zdGFuY2VzIGNhbiBiZSBhdWdtZW50ZWRcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJiAvLyBjaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgICAgICAgbmV3IFVpbnQ4QXJyYXkoMSkuc3ViYXJyYXkoMSwgMSkuYnl0ZUxlbmd0aCA9PT0gMCAvLyBpZTEwIGhhcyBicm9rZW4gYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoYXJnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKSB7XG4gICAgLy8gQXZvaWQgZ29pbmcgdGhyb3VnaCBhbiBBcmd1bWVudHNBZGFwdG9yVHJhbXBvbGluZSBpbiB0aGUgY29tbW9uIGNhc2UuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSByZXR1cm4gbmV3IEJ1ZmZlcihhcmcsIGFyZ3VtZW50c1sxXSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihhcmcpXG4gIH1cblxuICB0aGlzLmxlbmd0aCA9IDBcbiAgdGhpcy5wYXJlbnQgPSB1bmRlZmluZWRcblxuICAvLyBDb21tb24gY2FzZS5cbiAgaWYgKHR5cGVvZiBhcmcgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIGZyb21OdW1iZXIodGhpcywgYXJnKVxuICB9XG5cbiAgLy8gU2xpZ2h0bHkgbGVzcyBjb21tb24gY2FzZS5cbiAgaWYgKHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZyb21TdHJpbmcodGhpcywgYXJnLCBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3VtZW50c1sxXSA6ICd1dGY4JylcbiAgfVxuXG4gIC8vIFVudXN1YWwuXG4gIHJldHVybiBmcm9tT2JqZWN0KHRoaXMsIGFyZylcbn1cblxuZnVuY3Rpb24gZnJvbU51bWJlciAodGhhdCwgbGVuZ3RoKSB7XG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGggPCAwID8gMCA6IGNoZWNrZWQobGVuZ3RoKSB8IDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB0aGF0W2ldID0gMFxuICAgIH1cbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tU3RyaW5nICh0aGF0LCBzdHJpbmcsIGVuY29kaW5nKSB7XG4gIGlmICh0eXBlb2YgZW5jb2RpbmcgIT09ICdzdHJpbmcnIHx8IGVuY29kaW5nID09PSAnJykgZW5jb2RpbmcgPSAndXRmOCdcblxuICAvLyBBc3N1bXB0aW9uOiBieXRlTGVuZ3RoKCkgcmV0dXJuIHZhbHVlIGlzIGFsd2F5cyA8IGtNYXhMZW5ndGguXG4gIHZhciBsZW5ndGggPSBieXRlTGVuZ3RoKHN0cmluZywgZW5jb2RpbmcpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuXG4gIHRoYXQud3JpdGUoc3RyaW5nLCBlbmNvZGluZylcbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gZnJvbU9iamVjdCAodGhhdCwgb2JqZWN0KSB7XG4gIGlmIChCdWZmZXIuaXNCdWZmZXIob2JqZWN0KSkgcmV0dXJuIGZyb21CdWZmZXIodGhhdCwgb2JqZWN0KVxuXG4gIGlmIChpc0FycmF5KG9iamVjdCkpIHJldHVybiBmcm9tQXJyYXkodGhhdCwgb2JqZWN0KVxuXG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3RhcnQgd2l0aCBudW1iZXIsIGJ1ZmZlciwgYXJyYXkgb3Igc3RyaW5nJylcbiAgfVxuXG4gIGlmICh0eXBlb2YgQXJyYXlCdWZmZXIgIT09ICd1bmRlZmluZWQnICYmIG9iamVjdC5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBmcm9tVHlwZWRBcnJheSh0aGF0LCBvYmplY3QpXG4gIH1cblxuICBpZiAob2JqZWN0Lmxlbmd0aCkgcmV0dXJuIGZyb21BcnJheUxpa2UodGhhdCwgb2JqZWN0KVxuXG4gIHJldHVybiBmcm9tSnNvbk9iamVjdCh0aGF0LCBvYmplY3QpXG59XG5cbmZ1bmN0aW9uIGZyb21CdWZmZXIgKHRoYXQsIGJ1ZmZlcikge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChidWZmZXIubGVuZ3RoKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcbiAgYnVmZmVyLmNvcHkodGhhdCwgMCwgMCwgbGVuZ3RoKVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXkgKHRoYXQsIGFycmF5KSB7XG4gIHZhciBsZW5ndGggPSBjaGVja2VkKGFycmF5Lmxlbmd0aCkgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG4vLyBEdXBsaWNhdGUgb2YgZnJvbUFycmF5KCkgdG8ga2VlcCBmcm9tQXJyYXkoKSBtb25vbW9ycGhpYy5cbmZ1bmN0aW9uIGZyb21UeXBlZEFycmF5ICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICAvLyBUcnVuY2F0aW5nIHRoZSBlbGVtZW50cyBpcyBwcm9iYWJseSBub3Qgd2hhdCBwZW9wbGUgZXhwZWN0IGZyb20gdHlwZWRcbiAgLy8gYXJyYXlzIHdpdGggQllURVNfUEVSX0VMRU1FTlQgPiAxIGJ1dCBpdCdzIGNvbXBhdGlibGUgd2l0aCB0aGUgYmVoYXZpb3JcbiAgLy8gb2YgdGhlIG9sZCBCdWZmZXIgY29uc3RydWN0b3IuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXlMaWtlICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgdGhhdFtpXSA9IGFycmF5W2ldICYgMjU1XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuLy8gRGVzZXJpYWxpemUgeyB0eXBlOiAnQnVmZmVyJywgZGF0YTogWzEsMiwzLC4uLl0gfSBpbnRvIGEgQnVmZmVyIG9iamVjdC5cbi8vIFJldHVybnMgYSB6ZXJvLWxlbmd0aCBidWZmZXIgZm9yIGlucHV0cyB0aGF0IGRvbid0IGNvbmZvcm0gdG8gdGhlIHNwZWMuXG5mdW5jdGlvbiBmcm9tSnNvbk9iamVjdCAodGhhdCwgb2JqZWN0KSB7XG4gIHZhciBhcnJheVxuICB2YXIgbGVuZ3RoID0gMFxuXG4gIGlmIChvYmplY3QudHlwZSA9PT0gJ0J1ZmZlcicgJiYgaXNBcnJheShvYmplY3QuZGF0YSkpIHtcbiAgICBhcnJheSA9IG9iamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB9XG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGFsbG9jYXRlICh0aGF0LCBsZW5ndGgpIHtcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UsIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgdGhhdCA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gYW4gb2JqZWN0IGluc3RhbmNlIG9mIHRoZSBCdWZmZXIgY2xhc3NcbiAgICB0aGF0Lmxlbmd0aCA9IGxlbmd0aFxuICAgIHRoYXQuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGZyb21Qb29sID0gbGVuZ3RoICE9PSAwICYmIGxlbmd0aCA8PSBCdWZmZXIucG9vbFNpemUgPj4+IDFcbiAgaWYgKGZyb21Qb29sKSB0aGF0LnBhcmVudCA9IHJvb3RQYXJlbnRcblxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBjaGVja2VkIChsZW5ndGgpIHtcbiAgLy8gTm90ZTogY2Fubm90IHVzZSBgbGVuZ3RoIDwga01heExlbmd0aGAgaGVyZSBiZWNhdXNlIHRoYXQgZmFpbHMgd2hlblxuICAvLyBsZW5ndGggaXMgTmFOICh3aGljaCBpcyBvdGhlcndpc2UgY29lcmNlZCB0byB6ZXJvLilcbiAgaWYgKGxlbmd0aCA+PSBrTWF4TGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ3NpemU6IDB4JyArIGtNYXhMZW5ndGgudG9TdHJpbmcoMTYpICsgJyBieXRlcycpXG4gIH1cbiAgcmV0dXJuIGxlbmd0aCB8IDBcbn1cblxuZnVuY3Rpb24gU2xvd0J1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNsb3dCdWZmZXIpKSByZXR1cm4gbmV3IFNsb3dCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcpXG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGRlbGV0ZSBidWYucGFyZW50XG4gIHJldHVybiBidWZcbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gaXNCdWZmZXIgKGIpIHtcbiAgcmV0dXJuICEhKGIgIT0gbnVsbCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgbXVzdCBiZSBCdWZmZXJzJylcbiAgfVxuXG4gIGlmIChhID09PSBiKSByZXR1cm4gMFxuXG4gIHZhciB4ID0gYS5sZW5ndGhcbiAgdmFyIHkgPSBiLmxlbmd0aFxuXG4gIHZhciBpID0gMFxuICB2YXIgbGVuID0gTWF0aC5taW4oeCwgeSlcbiAgd2hpbGUgKGkgPCBsZW4pIHtcbiAgICBpZiAoYVtpXSAhPT0gYltpXSkgYnJlYWtcblxuICAgICsraVxuICB9XG5cbiAgaWYgKGkgIT09IGxlbikge1xuICAgIHggPSBhW2ldXG4gICAgeSA9IGJbaV1cbiAgfVxuXG4gIGlmICh4IDwgeSkgcmV0dXJuIC0xXG4gIGlmICh5IDwgeCkgcmV0dXJuIDFcbiAgcmV0dXJuIDBcbn1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiBpc0VuY29kaW5nIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIGNvbmNhdCAobGlzdCwgbGVuZ3RoKSB7XG4gIGlmICghaXNBcnJheShsaXN0KSkgdGhyb3cgbmV3IFR5cGVFcnJvcignbGlzdCBhcmd1bWVudCBtdXN0IGJlIGFuIEFycmF5IG9mIEJ1ZmZlcnMuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIGxlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgbGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIobGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbmZ1bmN0aW9uIGJ5dGVMZW5ndGggKHN0cmluZywgZW5jb2RpbmcpIHtcbiAgaWYgKHR5cGVvZiBzdHJpbmcgIT09ICdzdHJpbmcnKSBzdHJpbmcgPSBTdHJpbmcoc3RyaW5nKVxuXG4gIGlmIChzdHJpbmcubGVuZ3RoID09PSAwKSByZXR1cm4gMFxuXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldHVybiBzdHJpbmcubGVuZ3RoXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiBzdHJpbmcubGVuZ3RoICogMlxuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXR1cm4gc3RyaW5nLmxlbmd0aCA+Pj4gMVxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldHVybiB1dGY4VG9CeXRlcyhzdHJpbmcpLmxlbmd0aFxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gYmFzZTY0VG9CeXRlcyhzdHJpbmcpLmxlbmd0aFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RyaW5nLmxlbmd0aFxuICB9XG59XG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4vLyB0b1N0cmluZyhlbmNvZGluZywgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gdG9TdHJpbmcgKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCB8IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID09PSBJbmZpbml0eSA/IHRoaXMubGVuZ3RoIDogZW5kIHwgMFxuXG4gIGlmICghZW5jb2RpbmcpIGVuY29kaW5nID0gJ3V0ZjgnXG4gIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmIChlbmQgPD0gc3RhcnQpIHJldHVybiAnJ1xuXG4gIHdoaWxlICh0cnVlKSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGhleFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgICAgcmV0dXJuIGFzY2lpU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgcmV0dXJuIGJpbmFyeVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICAgIHJldHVybiBiYXNlNjRTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gdXRmMTZsZVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIGVxdWFscyAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIGlmICh0aGlzID09PSBiKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gaW5zcGVjdCAoKSB7XG4gIHZhciBzdHIgPSAnJ1xuICB2YXIgbWF4ID0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFU1xuICBpZiAodGhpcy5sZW5ndGggPiAwKSB7XG4gICAgc3RyID0gdGhpcy50b1N0cmluZygnaGV4JywgMCwgbWF4KS5tYXRjaCgvLnsyfS9nKS5qb2luKCcgJylcbiAgICBpZiAodGhpcy5sZW5ndGggPiBtYXgpIHN0ciArPSAnIC4uLiAnXG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBzdHIgKyAnPidcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24gY29tcGFyZSAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIGlmICh0aGlzID09PSBiKSByZXR1cm4gMFxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYilcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbmRleE9mID0gZnVuY3Rpb24gaW5kZXhPZiAodmFsLCBieXRlT2Zmc2V0KSB7XG4gIGlmIChieXRlT2Zmc2V0ID4gMHg3ZmZmZmZmZikgYnl0ZU9mZnNldCA9IDB4N2ZmZmZmZmZcbiAgZWxzZSBpZiAoYnl0ZU9mZnNldCA8IC0weDgwMDAwMDAwKSBieXRlT2Zmc2V0ID0gLTB4ODAwMDAwMDBcbiAgYnl0ZU9mZnNldCA+Pj0gMFxuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIC0xXG4gIGlmIChieXRlT2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm4gLTFcblxuICAvLyBOZWdhdGl2ZSBvZmZzZXRzIHN0YXJ0IGZyb20gdGhlIGVuZCBvZiB0aGUgYnVmZmVyXG4gIGlmIChieXRlT2Zmc2V0IDwgMCkgYnl0ZU9mZnNldCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoICsgYnl0ZU9mZnNldCwgMClcblxuICBpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAodmFsLmxlbmd0aCA9PT0gMCkgcmV0dXJuIC0xIC8vIHNwZWNpYWwgY2FzZTogbG9va2luZyBmb3IgZW1wdHkgc3RyaW5nIGFsd2F5cyBmYWlsc1xuICAgIHJldHVybiBTdHJpbmcucHJvdG90eXBlLmluZGV4T2YuY2FsbCh0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gIH1cbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcih2YWwpKSB7XG4gICAgcmV0dXJuIGFycmF5SW5kZXhPZih0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gIH1cbiAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUICYmIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBVaW50OEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwodGhpcywgdmFsLCBieXRlT2Zmc2V0KVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIFsgdmFsIF0sIGJ5dGVPZmZzZXQpXG4gIH1cblxuICBmdW5jdGlvbiBhcnJheUluZGV4T2YgKGFyciwgdmFsLCBieXRlT2Zmc2V0KSB7XG4gICAgdmFyIGZvdW5kSW5kZXggPSAtMVxuICAgIGZvciAodmFyIGkgPSAwOyBieXRlT2Zmc2V0ICsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFycltieXRlT2Zmc2V0ICsgaV0gPT09IHZhbFtmb3VuZEluZGV4ID09PSAtMSA/IDAgOiBpIC0gZm91bmRJbmRleF0pIHtcbiAgICAgICAgaWYgKGZvdW5kSW5kZXggPT09IC0xKSBmb3VuZEluZGV4ID0gaVxuICAgICAgICBpZiAoaSAtIGZvdW5kSW5kZXggKyAxID09PSB2YWwubGVuZ3RoKSByZXR1cm4gYnl0ZU9mZnNldCArIGZvdW5kSW5kZXhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSAtMVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gLTFcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbCBtdXN0IGJlIHN0cmluZywgbnVtYmVyIG9yIEJ1ZmZlcicpXG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIGdldCAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiBzZXQgKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbmZ1bmN0aW9uIGhleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKHN0ckxlbiAlIDIgIT09IDApIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHBhcnNlZCA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4ocGFyc2VkKSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IHBhcnNlZFxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIHV0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZywgYnVmLmxlbmd0aCAtIG9mZnNldCksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGFzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiB1Y3MyV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcsIGJ1Zi5sZW5ndGggLSBvZmZzZXQpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gd3JpdGUgKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcpXG4gIGlmIChvZmZzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgIGVuY29kaW5nID0gJ3V0ZjgnXG4gICAgbGVuZ3RoID0gdGhpcy5sZW5ndGhcbiAgICBvZmZzZXQgPSAwXG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiBvZmZzZXQgPT09ICdzdHJpbmcnKSB7XG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBsZW5ndGggPSB0aGlzLmxlbmd0aFxuICAgIG9mZnNldCA9IDBcbiAgLy8gQnVmZmVyI3dyaXRlKHN0cmluZywgb2Zmc2V0WywgbGVuZ3RoXVssIGVuY29kaW5nXSlcbiAgfSBlbHNlIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICAgIGlmIChpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBsZW5ndGggPSBsZW5ndGggfCAwXG4gICAgICBpZiAoZW5jb2RpbmcgPT09IHVuZGVmaW5lZCkgZW5jb2RpbmcgPSAndXRmOCdcbiAgICB9IGVsc2Uge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgLy8gbGVnYWN5IHdyaXRlKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKSAtIHJlbW92ZSBpbiB2MC4xM1xuICB9IGVsc2Uge1xuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aCB8IDBcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA+IHJlbWFpbmluZykgbGVuZ3RoID0gcmVtYWluaW5nXG5cbiAgaWYgKChzdHJpbmcubGVuZ3RoID4gMCAmJiAobGVuZ3RoIDwgMCB8fCBvZmZzZXQgPCAwKSkgfHwgb2Zmc2V0ID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignYXR0ZW1wdCB0byB3cml0ZSBvdXRzaWRlIGJ1ZmZlciBib3VuZHMnKVxuICB9XG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcblxuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuICBmb3IgKDs7KSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGhleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgICAgcmV0dXJuIGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgcmV0dXJuIGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICAgIC8vIFdhcm5pbmc6IG1heExlbmd0aCBub3QgdGFrZW4gaW50byBhY2NvdW50IGluIGJhc2U2NFdyaXRlXG4gICAgICAgIHJldHVybiBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gdWNzMldyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9ICgnJyArIGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIHRvSlNPTiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuZnVuY3Rpb24gYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIHV0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBhc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSAmIDB4N0YpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBiaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBoZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSArIDFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIHNsaWNlIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IH5+c3RhcnRcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgPyBsZW4gOiB+fmVuZFxuXG4gIGlmIChzdGFydCA8IDApIHtcbiAgICBzdGFydCArPSBsZW5cbiAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgfSBlbHNlIGlmIChzdGFydCA+IGxlbikge1xuICAgIHN0YXJ0ID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgMCkge1xuICAgIGVuZCArPSBsZW5cbiAgICBpZiAoZW5kIDwgMCkgZW5kID0gMFxuICB9IGVsc2UgaWYgKGVuZCA+IGxlbikge1xuICAgIGVuZCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IHN0YXJ0KSBlbmQgPSBzdGFydFxuXG4gIHZhciBuZXdCdWZcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgbmV3QnVmID0gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gIH1cblxuICBpZiAobmV3QnVmLmxlbmd0aCkgbmV3QnVmLnBhcmVudCA9IHRoaXMucGFyZW50IHx8IHRoaXNcblxuICByZXR1cm4gbmV3QnVmXG59XG5cbi8qXG4gKiBOZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGJ1ZmZlciBpc24ndCB0cnlpbmcgdG8gd3JpdGUgb3V0IG9mIGJvdW5kcy5cbiAqL1xuZnVuY3Rpb24gY2hlY2tPZmZzZXQgKG9mZnNldCwgZXh0LCBsZW5ndGgpIHtcbiAgaWYgKChvZmZzZXQgJSAxKSAhPT0gMCB8fCBvZmZzZXQgPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignb2Zmc2V0IGlzIG5vdCB1aW50JylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RyeWluZyB0byBhY2Nlc3MgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50TEUgPSBmdW5jdGlvbiByZWFkVUludExFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XVxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyBpXSAqIG11bFxuICB9XG5cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50QkUgPSBmdW5jdGlvbiByZWFkVUludEJFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuICB9XG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgLS1ieXRlTGVuZ3RoXVxuICB2YXIgbXVsID0gMVxuICB3aGlsZSAoYnl0ZUxlbmd0aCA+IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gcmVhZFVJbnQ4IChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiByZWFkVUludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gcmVhZFVJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIHJlYWRVSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAoKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpKSArXG4gICAgICAodGhpc1tvZmZzZXQgKyAzXSAqIDB4MTAwMDAwMClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiByZWFkVUludDMyQkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSAqIDB4MTAwMDAwMCkgK1xuICAgICgodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICB0aGlzW29mZnNldCArIDNdKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnRMRSA9IGZ1bmN0aW9uIHJlYWRJbnRMRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldF1cbiAgdmFyIG11bCA9IDFcbiAgdmFyIGkgPSAwXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgaV0gKiBtdWxcbiAgfVxuICBtdWwgKj0gMHg4MFxuXG4gIGlmICh2YWwgPj0gbXVsKSB2YWwgLT0gTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpXG5cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnRCRSA9IGZ1bmN0aW9uIHJlYWRJbnRCRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aFxuICB2YXIgbXVsID0gMVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWldXG4gIHdoaWxlIChpID4gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIC0taV0gKiBtdWxcbiAgfVxuICBtdWwgKj0gMHg4MFxuXG4gIGlmICh2YWwgPj0gbXVsKSB2YWwgLT0gTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpXG5cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gcmVhZEludDggKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgaWYgKCEodGhpc1tvZmZzZXRdICYgMHg4MCkpIHJldHVybiAodGhpc1tvZmZzZXRdKVxuICByZXR1cm4gKCgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIHJlYWRJbnQxNkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldF0gfCAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiByZWFkSW50MTZCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAxXSB8ICh0aGlzW29mZnNldF0gPDwgOClcbiAgcmV0dXJuICh2YWwgJiAweDgwMDApID8gdmFsIHwgMHhGRkZGMDAwMCA6IHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gcmVhZEludDMyTEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSkgfFxuICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikgfFxuICAgICh0aGlzW29mZnNldCArIDNdIDw8IDI0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gcmVhZEludDMyQkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSA8PCAyNCkgfFxuICAgICh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICh0aGlzW29mZnNldCArIDNdKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gcmVhZEZsb2F0TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIHRydWUsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gcmVhZEZsb2F0QkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiByZWFkRG91YmxlTEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA4LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIHRydWUsIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIHJlYWREb3VibGVCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDUyLCA4KVxufVxuXG5mdW5jdGlvbiBjaGVja0ludCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBleHQsIG1heCwgbWluKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGJ1ZikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2J1ZmZlciBtdXN0IGJlIGEgQnVmZmVyIGluc3RhbmNlJylcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnRMRSA9IGZ1bmN0aW9uIHdyaXRlVUludExFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCksIDApXG5cbiAgdmFyIG11bCA9IDFcbiAgdmFyIGkgPSAwXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAodmFsdWUgLyBtdWwpICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnRCRSA9IGZ1bmN0aW9uIHdyaXRlVUludEJFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCksIDApXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoIC0gMVxuICB2YXIgbXVsID0gMVxuICB0aGlzW29mZnNldCArIGldID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgtLWkgPj0gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAodmFsdWUgLyBtdWwpICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gd3JpdGVVSW50OCAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweGZmLCAwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB2YWx1ZSA9IE1hdGguZmxvb3IodmFsdWUpXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uIHdyaXRlVUludDE2TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHhmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiB3cml0ZVVJbnQxNkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiB3cml0ZVVJbnQzMkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uIHdyaXRlVUludDMyQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSB2YWx1ZVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnRMRSA9IGZ1bmN0aW9uIHdyaXRlSW50TEUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIHZhciBsaW1pdCA9IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSlcblxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIGxpbWl0IC0gMSwgLWxpbWl0KVxuICB9XG5cbiAgdmFyIGkgPSAwXG4gIHZhciBtdWwgPSAxXG4gIHZhciBzdWIgPSB2YWx1ZSA8IDAgPyAxIDogMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50QkUgPSBmdW5jdGlvbiB3cml0ZUludEJFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICB2YXIgbGltaXQgPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpXG5cbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBsaW1pdCAtIDEsIC1saW1pdClcbiAgfVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IHZhbHVlIDwgMCA/IDEgOiAwXG4gIHRoaXNbb2Zmc2V0ICsgaV0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKC0taSA+PSAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICgodmFsdWUgLyBtdWwpID4+IDApIC0gc3ViICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiB3cml0ZUludDggKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHg3ZiwgLTB4ODApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmICsgdmFsdWUgKyAxXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gd3JpdGVJbnQxNkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4N2ZmZiwgLTB4ODAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiB3cml0ZUludDE2QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiB3cml0ZUludDMyTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gd3JpdGVJbnQzMkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSB2YWx1ZVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbmZ1bmN0aW9uIGNoZWNrSUVFRTc1NCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBleHQsIG1heCwgbWluKSB7XG4gIGlmICh2YWx1ZSA+IG1heCB8fCB2YWx1ZSA8IG1pbikgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG4gIGlmIChvZmZzZXQgPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuZnVuY3Rpb24gd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA0LCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiB3cml0ZUZsb2F0TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uIHdyaXRlRmxvYXRCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiB3cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA4LCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICByZXR1cm4gb2Zmc2V0ICsgOFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiB3cml0ZURvdWJsZUxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uIHdyaXRlRG91YmxlQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uIGNvcHkgKHRhcmdldCwgdGFyZ2V0U3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldFN0YXJ0ID49IHRhcmdldC5sZW5ndGgpIHRhcmdldFN0YXJ0ID0gdGFyZ2V0Lmxlbmd0aFxuICBpZiAoIXRhcmdldFN0YXJ0KSB0YXJnZXRTdGFydCA9IDBcbiAgaWYgKGVuZCA+IDAgJiYgZW5kIDwgc3RhcnQpIGVuZCA9IHN0YXJ0XG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm4gMFxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCB0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDBcblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmICh0YXJnZXRTdGFydCA8IDApIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIH1cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0U3RhcnQgPCBlbmQgLSBzdGFydCkge1xuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRTdGFydCArIHN0YXJ0XG4gIH1cblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwMCB8fCAhQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICB0YXJnZXRbaSArIHRhcmdldFN0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldFN0YXJ0KVxuICB9XG5cbiAgcmV0dXJuIGxlblxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uIGZpbGwgKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKGVuZCA8IHN0YXJ0KSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCB8fCBlbmQgPiB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHRoaXNbaV0gPSB2YWx1ZVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgYnl0ZXMgPSB1dGY4VG9CeXRlcyh2YWx1ZS50b1N0cmluZygpKVxuICAgIHZhciBsZW4gPSBieXRlcy5sZW5ndGhcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gYnl0ZXNbaSAlIGxlbl1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiB0b0FycmF5QnVmZmVyICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSkge1xuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICB9XG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiBfYXVnbWVudCAoYXJyKSB7XG4gIGFyci5jb25zdHJ1Y3RvciA9IEJ1ZmZlclxuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgc2V0IG1ldGhvZCBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuZXF1YWxzID0gQlAuZXF1YWxzXG4gIGFyci5jb21wYXJlID0gQlAuY29tcGFyZVxuICBhcnIuaW5kZXhPZiA9IEJQLmluZGV4T2ZcbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludExFID0gQlAucmVhZFVJbnRMRVxuICBhcnIucmVhZFVJbnRCRSA9IEJQLnJlYWRVSW50QkVcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50TEUgPSBCUC5yZWFkSW50TEVcbiAgYXJyLnJlYWRJbnRCRSA9IEJQLnJlYWRJbnRCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnRMRSA9IEJQLndyaXRlVUludExFXG4gIGFyci53cml0ZVVJbnRCRSA9IEJQLndyaXRlVUludEJFXG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnRMRSA9IEJQLndyaXRlSW50TEVcbiAgYXJyLndyaXRlSW50QkUgPSBCUC53cml0ZUludEJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxudmFyIElOVkFMSURfQkFTRTY0X1JFID0gL1teK1xcLzAtOUEtelxcLV0vZ1xuXG5mdW5jdGlvbiBiYXNlNjRjbGVhbiAoc3RyKSB7XG4gIC8vIE5vZGUgc3RyaXBzIG91dCBpbnZhbGlkIGNoYXJhY3RlcnMgbGlrZSBcXG4gYW5kIFxcdCBmcm9tIHRoZSBzdHJpbmcsIGJhc2U2NC1qcyBkb2VzIG5vdFxuICBzdHIgPSBzdHJpbmd0cmltKHN0cikucmVwbGFjZShJTlZBTElEX0JBU0U2NF9SRSwgJycpXG4gIC8vIE5vZGUgY29udmVydHMgc3RyaW5ncyB3aXRoIGxlbmd0aCA8IDIgdG8gJydcbiAgaWYgKHN0ci5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyaW5nLCB1bml0cykge1xuICB1bml0cyA9IHVuaXRzIHx8IEluZmluaXR5XG4gIHZhciBjb2RlUG9pbnRcbiAgdmFyIGxlbmd0aCA9IHN0cmluZy5sZW5ndGhcbiAgdmFyIGxlYWRTdXJyb2dhdGUgPSBudWxsXG4gIHZhciBieXRlcyA9IFtdXG4gIHZhciBpID0gMFxuXG4gIGZvciAoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBjb2RlUG9pbnQgPSBzdHJpbmcuY2hhckNvZGVBdChpKVxuXG4gICAgLy8gaXMgc3Vycm9nYXRlIGNvbXBvbmVudFxuICAgIGlmIChjb2RlUG9pbnQgPiAweEQ3RkYgJiYgY29kZVBvaW50IDwgMHhFMDAwKSB7XG4gICAgICAvLyBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgICAgaWYgKGxlYWRTdXJyb2dhdGUpIHtcbiAgICAgICAgLy8gMiBsZWFkcyBpbiBhIHJvd1xuICAgICAgICBpZiAoY29kZVBvaW50IDwgMHhEQzAwKSB7XG4gICAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IGNvZGVQb2ludFxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gdmFsaWQgc3Vycm9nYXRlIHBhaXJcbiAgICAgICAgICBjb2RlUG9pbnQgPSBsZWFkU3Vycm9nYXRlIC0gMHhEODAwIDw8IDEwIHwgY29kZVBvaW50IC0gMHhEQzAwIHwgMHgxMDAwMFxuICAgICAgICAgIGxlYWRTdXJyb2dhdGUgPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG5vIGxlYWQgeWV0XG5cbiAgICAgICAgaWYgKGNvZGVQb2ludCA+IDB4REJGRikge1xuICAgICAgICAgIC8vIHVuZXhwZWN0ZWQgdHJhaWxcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGkgKyAxID09PSBsZW5ndGgpIHtcbiAgICAgICAgICAvLyB1bnBhaXJlZCBsZWFkXG4gICAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB2YWxpZCBsZWFkXG4gICAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IGNvZGVQb2ludFxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGxlYWRTdXJyb2dhdGUpIHtcbiAgICAgIC8vIHZhbGlkIGJtcCBjaGFyLCBidXQgbGFzdCBjaGFyIHdhcyBhIGxlYWRcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgICB9XG5cbiAgICAvLyBlbmNvZGUgdXRmOFxuICAgIGlmIChjb2RlUG9pbnQgPCAweDgwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDEpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goY29kZVBvaW50KVxuICAgIH0gZWxzZSBpZiAoY29kZVBvaW50IDwgMHg4MDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMikgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiB8IDB4QzAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDEwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDMpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgfCAweEUwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDIwMDAwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSA0KSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHgxMiB8IDB4RjAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgJiAweDNGIHwgMHg4MFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29kZSBwb2ludCcpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVzXG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIsIHVuaXRzKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG5cbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShiYXNlNjRjbGVhbihzdHIpKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSkgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cdHZhciBQTFVTX1VSTF9TQUZFID0gJy0nLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIX1VSTF9TQUZFID0gJ18nLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUyB8fFxuXHRcdCAgICBjb2RlID09PSBQTFVTX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSCB8fFxuXHRcdCAgICBjb2RlID09PSBTTEFTSF9VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24gKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXVxuXG4gIGkgKz0gZFxuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpXG4gIHMgPj49ICgtbkJpdHMpXG4gIG5CaXRzICs9IGVMZW5cbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCkge31cblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBlID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBtTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzXG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KVxuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbilcbiAgICBlID0gZSAtIGVCaWFzXG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbilcbn1cblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uIChidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDBcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKVxuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwXG4gICAgZSA9IGVNYXhcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMilcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS1cbiAgICAgIGMgKj0gMlxuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gY1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcylcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKytcbiAgICAgIGMgLz0gMlxuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDBcbiAgICAgIGUgPSBlTWF4XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pXG4gICAgICBlID0gZSArIGVCaWFzXG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IDBcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KSB7fVxuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG1cbiAgZUxlbiArPSBtTGVuXG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCkge31cblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjhcbn1cbiIsIlxuLyoqXG4gKiBpc0FycmF5XG4gKi9cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG4vKipcbiAqIHRvU3RyaW5nXG4gKi9cblxudmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogV2hldGhlciBvciBub3QgdGhlIGdpdmVuIGB2YWxgXG4gKiBpcyBhbiBhcnJheS5cbiAqXG4gKiBleGFtcGxlOlxuICpcbiAqICAgICAgICBpc0FycmF5KFtdKTtcbiAqICAgICAgICAvLyA+IHRydWVcbiAqICAgICAgICBpc0FycmF5KGFyZ3VtZW50cyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICogICAgICAgIGlzQXJyYXkoJycpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqXG4gKiBAcGFyYW0ge21peGVkfSB2YWxcbiAqIEByZXR1cm4ge2Jvb2x9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5IHx8IGZ1bmN0aW9uICh2YWwpIHtcbiAgcmV0dXJuICEhIHZhbCAmJiAnW29iamVjdCBBcnJheV0nID09IHN0ci5jYWxsKHZhbCk7XG59O1xuIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL0JpZ0ludGVnZXInKTsiLCIvKipcbiAqIEltbXV0YWJsZSBhcmJpdHJhcnktcHJlY2lzaW9uIGludGVnZXJzLiAgQWxsIG9wZXJhdGlvbnMgYmVoYXZlIGFzIGlmXG4gKiBCaWdJbnRlZ2VycyB3ZXJlIHJlcHJlc2VudGVkIGluIHR3bydzLWNvbXBsZW1lbnQgbm90YXRpb24gKGxpa2UgSmF2YSdzXG4gKiBwcmltaXRpdmUgaW50ZWdlciB0eXBlcykuICBCaWdJbnRlZ2VyIHByb3ZpZGVzIGFuYWxvZ3VlcyB0byBhbGwgb2YgSmF2YSdzXG4gKiBwcmltaXRpdmUgaW50ZWdlciBvcGVyYXRvcnMsIGFuZCBhbGwgcmVsZXZhbnQgbWV0aG9kcyBmcm9tIGphdmEubGFuZy5NYXRoLlxuICogQWRkaXRpb25hbGx5LCBCaWdJbnRlZ2VyIHByb3ZpZGVzIG9wZXJhdGlvbnMgZm9yIG1vZHVsYXIgYXJpdGhtZXRpYywgR0NEXG4gKiBjYWxjdWxhdGlvbiwgcHJpbWFsaXR5IHRlc3RpbmcsIHByaW1lIGdlbmVyYXRpb24sIGJpdCBtYW5pcHVsYXRpb24sXG4gKiBhbmQgYSBmZXcgb3RoZXIgbWlzY2VsbGFuZW91cyBvcGVyYXRpb25zLlxuICpcbiAqIDxwPlNlbWFudGljcyBvZiBhcml0aG1ldGljIG9wZXJhdGlvbnMgZXhhY3RseSBtaW1pYyB0aG9zZSBvZiBKYXZhJ3MgaW50ZWdlclxuICogYXJpdGhtZXRpYyBvcGVyYXRvcnMsIGFzIGRlZmluZWQgaW4gPGk+VGhlIEphdmEgTGFuZ3VhZ2UgU3BlY2lmaWNhdGlvbjwvaT4uXG4gKiBGb3IgZXhhbXBsZSwgZGl2aXNpb24gYnkgemVybyB0aHJvd3MgYW4ge0Bjb2RlIEFyaXRobWV0aWNFeGNlcHRpb259LCBhbmRcbiAqIGRpdmlzaW9uIG9mIGEgbmVnYXRpdmUgYnkgYSBwb3NpdGl2ZSB5aWVsZHMgYSBuZWdhdGl2ZSAob3IgemVybykgcmVtYWluZGVyLlxuICogQWxsIG9mIHRoZSBkZXRhaWxzIGluIHRoZSBTcGVjIGNvbmNlcm5pbmcgb3ZlcmZsb3cgYXJlIGlnbm9yZWQsIGFzXG4gKiBCaWdJbnRlZ2VycyBhcmUgbWFkZSBhcyBsYXJnZSBhcyBuZWNlc3NhcnkgdG8gYWNjb21tb2RhdGUgdGhlIHJlc3VsdHMgb2YgYW5cbiAqIG9wZXJhdGlvbi5cbiAqXG4gKiA8cD5TZW1hbnRpY3Mgb2Ygc2hpZnQgb3BlcmF0aW9ucyBleHRlbmQgdGhvc2Ugb2YgSmF2YSdzIHNoaWZ0IG9wZXJhdG9yc1xuICogdG8gYWxsb3cgZm9yIG5lZ2F0aXZlIHNoaWZ0IGRpc3RhbmNlcy4gIEEgcmlnaHQtc2hpZnQgd2l0aCBhIG5lZ2F0aXZlXG4gKiBzaGlmdCBkaXN0YW5jZSByZXN1bHRzIGluIGEgbGVmdCBzaGlmdCwgYW5kIHZpY2UtdmVyc2EuICBUaGUgdW5zaWduZWRcbiAqIHJpZ2h0IHNoaWZ0IG9wZXJhdG9yICh7QGNvZGUgPj4+fSkgaXMgb21pdHRlZCwgYXMgdGhpcyBvcGVyYXRpb24gbWFrZXNcbiAqIGxpdHRsZSBzZW5zZSBpbiBjb21iaW5hdGlvbiB3aXRoIHRoZSBcImluZmluaXRlIHdvcmQgc2l6ZVwiIGFic3RyYWN0aW9uXG4gKiBwcm92aWRlZCBieSB0aGlzIGNsYXNzLlxuICpcbiAqIDxwPlNlbWFudGljcyBvZiBiaXR3aXNlIGxvZ2ljYWwgb3BlcmF0aW9ucyBleGFjdGx5IG1pbWljIHRob3NlIG9mIEphdmEnc1xuICogYml0d2lzZSBpbnRlZ2VyIG9wZXJhdG9ycy4gIFRoZSBiaW5hcnkgb3BlcmF0b3JzICh7QGNvZGUgYW5kfSxcbiAqIHtAY29kZSBvcn0sIHtAY29kZSB4b3J9KSBpbXBsaWNpdGx5IHBlcmZvcm0gc2lnbiBleHRlbnNpb24gb24gdGhlIHNob3J0ZXJcbiAqIG9mIHRoZSB0d28gb3BlcmFuZHMgcHJpb3IgdG8gcGVyZm9ybWluZyB0aGUgb3BlcmF0aW9uLlxuICpcbiAqIDxwPkNvbXBhcmlzb24gb3BlcmF0aW9ucyBwZXJmb3JtIHNpZ25lZCBpbnRlZ2VyIGNvbXBhcmlzb25zLCBhbmFsb2dvdXMgdG9cbiAqIHRob3NlIHBlcmZvcm1lZCBieSBKYXZhJ3MgcmVsYXRpb25hbCBhbmQgZXF1YWxpdHkgb3BlcmF0b3JzLlxuICpcbiAqIDxwPk1vZHVsYXIgYXJpdGhtZXRpYyBvcGVyYXRpb25zIGFyZSBwcm92aWRlZCB0byBjb21wdXRlIHJlc2lkdWVzLCBwZXJmb3JtXG4gKiBleHBvbmVudGlhdGlvbiwgYW5kIGNvbXB1dGUgbXVsdGlwbGljYXRpdmUgaW52ZXJzZXMuICBUaGVzZSBtZXRob2RzIGFsd2F5c1xuICogcmV0dXJuIGEgbm9uLW5lZ2F0aXZlIHJlc3VsdCwgYmV0d2VlbiB7QGNvZGUgMH0gYW5kIHtAY29kZSAobW9kdWx1cyAtIDEpfSxcbiAqIGluY2x1c2l2ZS5cbiAqXG4gKiA8cD5CaXQgb3BlcmF0aW9ucyBvcGVyYXRlIG9uIGEgc2luZ2xlIGJpdCBvZiB0aGUgdHdvJ3MtY29tcGxlbWVudFxuICogcmVwcmVzZW50YXRpb24gb2YgdGhlaXIgb3BlcmFuZC4gIElmIG5lY2Vzc2FyeSwgdGhlIG9wZXJhbmQgaXMgc2lnbi1cbiAqIGV4dGVuZGVkIHNvIHRoYXQgaXQgY29udGFpbnMgdGhlIGRlc2lnbmF0ZWQgYml0LiAgTm9uZSBvZiB0aGUgc2luZ2xlLWJpdFxuICogb3BlcmF0aW9ucyBjYW4gcHJvZHVjZSBhIEJpZ0ludGVnZXIgd2l0aCBhIGRpZmZlcmVudCBzaWduIGZyb20gdGhlXG4gKiBCaWdJbnRlZ2VyIGJlaW5nIG9wZXJhdGVkIG9uLCBhcyB0aGV5IGFmZmVjdCBvbmx5IGEgc2luZ2xlIGJpdCwgYW5kIHRoZVxuICogXCJpbmZpbml0ZSB3b3JkIHNpemVcIiBhYnN0cmFjdGlvbiBwcm92aWRlZCBieSB0aGlzIGNsYXNzIGVuc3VyZXMgdGhhdCB0aGVyZVxuICogYXJlIGluZmluaXRlbHkgbWFueSBcInZpcnR1YWwgc2lnbiBiaXRzXCIgcHJlY2VkaW5nIGVhY2ggQmlnSW50ZWdlci5cbiAqXG4gKiA8cD5Gb3IgdGhlIHNha2Ugb2YgYnJldml0eSBhbmQgY2xhcml0eSwgcHNldWRvLWNvZGUgaXMgdXNlZCB0aHJvdWdob3V0IHRoZVxuICogZGVzY3JpcHRpb25zIG9mIEJpZ0ludGVnZXIgbWV0aG9kcy4gIFRoZSBwc2V1ZG8tY29kZSBleHByZXNzaW9uXG4gKiB7QGNvZGUgKGkgKyBqKX0gaXMgc2hvcnRoYW5kIGZvciBcImEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpc1xuICogdGhhdCBvZiB0aGUgQmlnSW50ZWdlciB7QGNvZGUgaX0gcGx1cyB0aGF0IG9mIHRoZSBCaWdJbnRlZ2VyIHtAY29kZSBqfS5cIlxuICogVGhlIHBzZXVkby1jb2RlIGV4cHJlc3Npb24ge0Bjb2RlIChpID09IGopfSBpcyBzaG9ydGhhbmQgZm9yXG4gKiBcIntAY29kZSB0cnVlfSBpZiBhbmQgb25seSBpZiB0aGUgQmlnSW50ZWdlciB7QGNvZGUgaX0gcmVwcmVzZW50cyB0aGUgc2FtZVxuICogdmFsdWUgYXMgdGhlIEJpZ0ludGVnZXIge0Bjb2RlIGp9LlwiICBPdGhlciBwc2V1ZG8tY29kZSBleHByZXNzaW9ucyBhcmVcbiAqIGludGVycHJldGVkIHNpbWlsYXJseS5cbiAqXG4gKiA8cD5BbGwgbWV0aG9kcyBhbmQgY29uc3RydWN0b3JzIGluIHRoaXMgY2xhc3MgdGhyb3dcbiAqIHtAY29kZSBOdWxsUG9pbnRlckV4Y2VwdGlvbn0gd2hlbiBwYXNzZWRcbiAqIGEgbnVsbCBvYmplY3QgcmVmZXJlbmNlIGZvciBhbnkgaW5wdXQgcGFyYW1ldGVyLlxuICpcbiAqIEBzZWUgICAgIEJpZ0RlY2ltYWxcbiAqIEBhdXRob3IgIEpvc2ggQmxvY2hcbiAqIEBhdXRob3IgIE1pY2hhZWwgTWNDbG9za2V5XG4gKiBAc2luY2UgSkRLMS4xXG4gKi9cbnZhciBMb25nID0gcmVxdWlyZSgnbG9uZycpO1xudmFyIEludGVnZXIgPSByZXF1aXJlKCcuL0ludGVnZXInKTtcbnZhciBDb21tb24gPSByZXF1aXJlKCcuL2NvbW1vbicpO1xudmFyIE11dGFibGVCaWdJbnRlZ2VyID0gcmVxdWlyZSgnLi9NdXRhYmxlQmlnSW50ZWdlcicpO1xudmFyIEJpZ0ludGVnZXJMaWIgPSByZXF1aXJlKCcuL0JpZ0ludGVnZXJMaWInKTtcbnZhciBjbG9uZSA9IHJlcXVpcmUoJ2Nsb25lJyk7XG5cbnZhciBNSU5fUkFESVggPSAyO1xudmFyIE1BWF9SQURJWCA9IDM2O1xuXG52YXIgYml0c1BlckRpZ2l0ID0gWyAwLCAwLFxuICAxMDI0LCAxNjI0LCAyMDQ4LCAyMzc4LCAyNjQ4LCAyODc1LCAzMDcyLCAzMjQ3LCAzNDAyLCAzNTQzLCAzNjcyLFxuICAzNzkwLCAzODk5LCA0MDAxLCA0MDk2LCA0MTg2LCA0MjcxLCA0MzUwLCA0NDI2LCA0NDk4LCA0NTY3LCA0NjMzLFxuICA0Njk2LCA0NzU2LCA0ODE0LCA0ODcwLCA0OTIzLCA0OTc1LCA1MDI1LCA1MDc0LCA1MTIwLCA1MTY2LCA1MjEwLFxuICA1MjUzLCA1Mjk1XG5dO1xuXG52YXIgZGlnaXRzUGVySW50ID0gWzAsIDAsIDMwLCAxOSwgMTUsIDEzLCAxMSxcbiAgMTEsIDEwLCA5LCA5LCA4LCA4LCA4LCA4LCA3LCA3LCA3LCA3LCA3LCA3LCA3LCA2LCA2LCA2LCA2LFxuICA2LCA2LCA2LCA2LCA2LCA2LCA2LCA2LCA2LCA2LCA1XG5dO1xudmFyIGRpZ2l0c1BlckxvbmcgPSBbMCwgMCxcbiAgNjIsIDM5LCAzMSwgMjcsIDI0LCAyMiwgMjAsIDE5LCAxOCwgMTgsIDE3LCAxNywgMTYsIDE2LCAxNSwgMTUsIDE1LCAxNCxcbiAgMTQsIDE0LCAxNCwgMTMsIDEzLCAxMywgMTMsIDEzLCAxMywgMTIsIDEyLCAxMiwgMTIsIDEyLCAxMiwgMTIsIDEyXTtcblxudmFyIGludFJhZGl4ID0gWzAsIDAsXG4gIDB4NDAwMDAwMDAsIDB4NDU0NmIzZGIsIDB4NDAwMDAwMDAsIDB4NDhjMjczOTUsIDB4MTU5ZmQ4MDAsXG4gIDB4NzVkYjljOTcsIDB4NDAwMDAwMDAsIDB4MTcxNzkxNDksIDB4M2I5YWNhMDAsIDB4Y2M2ZGI2MSxcbiAgMHgxOWExMDAwMCwgMHgzMDlmMTAyMSwgMHg1N2Y2YzEwMCwgMHhhMmYxYjZmLCAgMHgxMDAwMDAwMCxcbiAgMHgxODc1NDU3MSwgMHgyNDdkYmM4MCwgMHgzNTQ3NjY3YiwgMHg0YzRiNDAwMCwgMHg2YjVhNmUxZCxcbiAgMHg2YzIwYTQwLCAgMHg4ZDJkOTMxLCAgMHhiNjQwMDAwLCAgMHhlOGQ0YTUxLCAgMHgxMjY5YWU0MCxcbiAgMHgxNzE3OTE0OSwgMHgxY2I5MTAwMCwgMHgyMzc0NDg5OSwgMHgyYjczYTg0MCwgMHgzNGU2M2I0MSxcbiAgMHg0MDAwMDAwMCwgMHg0Y2ZhM2NjMSwgMHg1YzEzZDg0MCwgMHg2ZDkxYjUxOSwgMHgzOWFhNDAwXG5dO1xuXG52YXIgTE9OR19NQVNLID0gMHhmZmZmZmZmZjtcbnZhciBNQVhfQ09OU1RBTlQgPSAxNjtcblxudmFyIGxvbmdSYWRpeCA9IFtudWxsLCBudWxsLFxuICBMb25nLmZyb21TdHJpbmcoJzQwMDAwMDAwMDAwMDAwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCczODNkOTE3MGI4NWZmODBiJywxNiksXG4gIExvbmcuZnJvbVN0cmluZygnNDAwMDAwMDAwMDAwMDAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoJzY3NjVjNzkzZmExMDA3OWQnLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCc0MWMyMWNiOGUxMDAwMDAwJywxNiksIExvbmcuZnJvbVN0cmluZygnMzY0Mjc5ODc1MDIyNjExMScsMTYpLFxuICBMb25nLmZyb21TdHJpbmcoJzEwMDAwMDAwMDAwMDAwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCcxMmJmMzA3YWU4MWZmZDU5JywxNiksXG4gIExvbmcuZnJvbVN0cmluZyggJ2RlMGI2YjNhNzY0MDAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoJzRkMjhjYjU2YzMzZmE1MzknLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCcxZWNhMTcwYzAwMDAwMDAwJywxNiksIExvbmcuZnJvbVN0cmluZygnNzgwYzczNzI2MjFiZDc0ZCcsMTYpLFxuICBMb25nLmZyb21TdHJpbmcoJzFlMzlhNTA1N2Q4MTAwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCc1YjI3YWM5OTNkZjk3NzAxJywxNiksXG4gIExvbmcuZnJvbVN0cmluZygnMTAwMDAwMDAwMDAwMDAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoJzI3Yjk1ZTk5N2UyMWQ5ZjEnLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCc1ZGEwZTFlNTNjNWM4MDAwJywxNiksIExvbmcuZnJvbVN0cmluZyggJ2IxNmE0NThlZjQwM2YxOScsMTYpLFxuICBMb25nLmZyb21TdHJpbmcoJzE2YmNjNDFlOTAwMDAwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCcyZDA0YjdmZGQ5YzBlZjQ5JywxNiksXG4gIExvbmcuZnJvbVN0cmluZygnNTY1ODU5N2JjYWEyNDAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoICc2ZmViMjY2OTMxYTc1YjcnLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCAnYzI5ZTk4MDAwMDAwMDAwJywxNiksIExvbmcuZnJvbVN0cmluZygnMTRhZGY0YjczMjAzMzRiOScsMTYpLFxuICBMb25nLmZyb21TdHJpbmcoJzIyNmVkMzY0NzhiZmEwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCczODNkOTE3MGI4NWZmODBiJywxNiksXG4gIExvbmcuZnJvbVN0cmluZygnNWEzYzIzZTM5YzAwMDAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoICc0ZTkwMGFiYjUzZTZiNzEnLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCAnNzYwMGVjNjE4MTQxMDAwJywxNiksIExvbmcuZnJvbVN0cmluZyggJ2FlZTU3MjBlZTgzMDY4MScsMTYpLFxuICBMb25nLmZyb21TdHJpbmcoJzEwMDAwMDAwMDAwMDAwMDAnLDE2KSwgTG9uZy5mcm9tU3RyaW5nKCcxNzI1ODhhZDRmNWYwOTgxJywxNiksXG4gIExvbmcuZnJvbVN0cmluZygnMjExZTQ0ZjdkMDJjMTAwMCcsMTYpLCBMb25nLmZyb21TdHJpbmcoJzJlZTU2NzI1ZjA2ZTVjNzEnLDE2KSxcbiAgTG9uZy5mcm9tU3RyaW5nKCc0MWMyMWNiOGUxMDAwMDAwJywxNilcbl07XG5cbi8qIHplcm9baV0gaXMgYSBzdHJpbmcgb2YgaSBjb25zZWN1dGl2ZSB6ZXJvcy4gKi9cbnZhciB6ZXJvcyA9IENvbW1vbi5pbnRBcnJheSg2NCk7XG56ZXJvc1s2M10gPSBcIjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMFwiO1xuZm9yICh2YXIgaSA9IDA7IGkgPCA2MzsgaSsrKVxuICB6ZXJvc1tpXSA9IHplcm9zWzYzXS5zdWJzdHJpbmcoMCwgaSk7XG5cblxuZnVuY3Rpb24gQmlnSW50ZWdlcigpIHtcbiAgdGhpcy5zaWdudW07XG4gIHRoaXMubWFnO1xuICB0aGlzLl9iaXRMZW5ndGggPSAwO1xuICB0aGlzLmJpdENvdW50ID0gMDtcbiAgdGhpcy5maXJzdE5vbnplcm9JbnROdW0gPSAwO1xuICB0aGlzLmxvd2VzdFNldEJpdCA9IDA7XG59XG5cbi8qKlxuICogVHJhbnNsYXRlcyBhIGJ5dGUgYXJyYXkgY29udGFpbmluZyB0aGUgdHdvJ3MtY29tcGxlbWVudCBiaW5hcnlcbiAqIHJlcHJlc2VudGF0aW9uIG9mIGEgQmlnSW50ZWdlciBpbnRvIGEgQmlnSW50ZWdlci4gIFRoZSBpbnB1dCBhcnJheSBpc1xuICogYXNzdW1lZCB0byBiZSBpbiA8aT5iaWctZW5kaWFuPC9pPiBieXRlLW9yZGVyOiB0aGUgbW9zdCBzaWduaWZpY2FudFxuICogYnl0ZSBpcyBpbiB0aGUgemVyb3RoIGVsZW1lbnQuXG4gKlxuICogQHBhcmFtICB2YWwgYmlnLWVuZGlhbiB0d28ncy1jb21wbGVtZW50IGJpbmFyeSByZXByZXNlbnRhdGlvbiBvZlxuICogICAgICAgICBCaWdJbnRlZ2VyLlxuICogQHRocm93cyBOdW1iZXJGb3JtYXRFeGNlcHRpb24ge0Bjb2RlIHZhbH0gaXMgemVybyBieXRlcyBsb25nLlxuICovXG5CaWdJbnRlZ2VyLmZyb21CdWZmZXIgPSBmdW5jdGlvbiAoc2lnbnVtLCBtYWduaXR1ZGUpIHtcbiAgdmFyIF9iaWdJbnRlZ2VyID0gbmV3IEJpZ0ludGVnZXIoKTtcbiAgX2JpZ0ludGVnZXIubWFnID0gX2JpZ0ludGVnZXIuX3N0cmlwTGVhZGluZ1plcm9CeXRlcyhtYWduaXR1ZGUpO1xuXG4gIGlmIChzaWdudW0gPCAtMSB8fCBzaWdudW0gPiAxKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc2lnbnVtIHZhbHVlXCIpO1xuXG4gIGlmIChfYmlnSW50ZWdlci5tYWcubGVuZ3RoPT0wKSB7XG4gICAgX2JpZ0ludGVnZXIuc2lnbnVtID0gMDtcbiAgfSBlbHNlIHtcbiAgICBpZiAoc2lnbnVtID09IDApXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJzaWdudW0tbWFnbml0dWRlIG1pc21hdGNoXCIpO1xuICAgIF9iaWdJbnRlZ2VyLnNpZ251bSA9IHNpZ251bTtcbiAgfVxuICByZXR1cm4gX2JpZ0ludGVnZXI7XG59O1xuXG5CaWdJbnRlZ2VyLmZyb21OdW1iZXIgPSBmdW5jdGlvbihudW1iZXIpIHtcbiAgdmFyIGxvbmcgPSBMb25nLmZyb21OdW1iZXIobnVtYmVyKTtcbiAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbUxvbmcobG9uZyk7XG59O1xuXG5CaWdJbnRlZ2VyLmZyb21Mb25nID0gZnVuY3Rpb24gKHZhbCkge1xuICB2YXIgX2JpZ0ludGVnZXIgPSBuZXcgQmlnSW50ZWdlcigpO1xuICBpZiAodmFsLmNvbXBhcmUoTG9uZy5aRVJPKSA8IDApIHtcbiAgICB2YWwgPSB2YWwubmVnYXRlKCk7XG4gICAgX2JpZ0ludGVnZXIuc2lnbnVtID0gLTE7XG4gIH0gZWxzZSB7XG4gICAgX2JpZ0ludGVnZXIuc2lnbnVtID0gMTtcbiAgfVxuXG4gIGlmICh2YWwuaGlnaCA9PT0gMCkge1xuICAgIF9iaWdJbnRlZ2VyLm1hZyA9IENvbW1vbi5pbnRBcnJheSgxKTtcbiAgICBfYmlnSW50ZWdlci5tYWdbMF0gPSB2YWwubG93O1xuICB9IGVsc2Uge1xuICAgIF9iaWdJbnRlZ2VyLm1hZyA9IENvbW1vbi5pbnRBcnJheSgyKTtcbiAgICBfYmlnSW50ZWdlci5tYWdbMF0gPSB2YWwuaGlnaDtcbiAgICBfYmlnSW50ZWdlci5tYWdbMV0gPSB2YWwubG93O1xuICB9XG4gIHJldHVybiBfYmlnSW50ZWdlcjtcbn07XG5cbi8qKlxuICogVHJhbnNsYXRlcyB0aGUgU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgQmlnSW50ZWdlciBpbiB0aGVcbiAqIHNwZWNpZmllZCByYWRpeCBpbnRvIGEgQmlnSW50ZWdlci4gIFRoZSBTdHJpbmcgcmVwcmVzZW50YXRpb25cbiAqIGNvbnNpc3RzIG9mIGFuIG9wdGlvbmFsIG1pbnVzIG9yIHBsdXMgc2lnbiBmb2xsb3dlZCBieSBhXG4gKiBzZXF1ZW5jZSBvZiBvbmUgb3IgbW9yZSBkaWdpdHMgaW4gdGhlIHNwZWNpZmllZCByYWRpeC4gIFRoZVxuICogY2hhcmFjdGVyLXRvLWRpZ2l0IG1hcHBpbmcgaXMgcHJvdmlkZWQgYnkge0Bjb2RlXG4gKiBDaGFyYWN0ZXIuZGlnaXR9LiAgVGhlIFN0cmluZyBtYXkgbm90IGNvbnRhaW4gYW55IGV4dHJhbmVvdXNcbiAqIGNoYXJhY3RlcnMgKHdoaXRlc3BhY2UsIGZvciBleGFtcGxlKS5cbiAqXG4gKiBAcGFyYW0gdmFsIFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBCaWdJbnRlZ2VyLlxuICogQHBhcmFtIHJhZGl4IHJhZGl4IHRvIGJlIHVzZWQgaW4gaW50ZXJwcmV0aW5nIHtAY29kZSB2YWx9LlxuICogQHRocm93cyBOdW1iZXJGb3JtYXRFeGNlcHRpb24ge0Bjb2RlIHZhbH0gaXMgbm90IGEgdmFsaWQgcmVwcmVzZW50YXRpb25cbiAqICAgICAgICAgb2YgYSBCaWdJbnRlZ2VyIGluIHRoZSBzcGVjaWZpZWQgcmFkaXgsIG9yIHtAY29kZSByYWRpeH0gaXNcbiAqICAgICAgICAgb3V0c2lkZSB0aGUgcmFuZ2UgZnJvbSB7QGxpbmsgQ2hhcmFjdGVyI01JTl9SQURJWH0gdG9cbiAqICAgICAgICAge0BsaW5rIENoYXJhY3RlciNNQVhfUkFESVh9LCBpbmNsdXNpdmUuXG4gKiBAc2VlICAgIENoYXJhY3RlciNkaWdpdFxuICovXG5CaWdJbnRlZ2VyLmZyb21TdHJpbmcgPSBmdW5jdGlvbiAodmFsLCByYWRpeCkge1xuICByYWRpeCA9IHJhZGl4IHx8IDEwO1xuICB2YXIgY3Vyc29yID0gMDtcbiAgdmFyIG51bURpZ2l0cztcbiAgdmFyIGxlbiA9IHZhbC5sZW5ndGg7XG4gIGlmIChyYWRpeCA8IE1JTl9SQURJWCB8fCByYWRpeCA+IE1BWF9SQURJWCkge1xuICAgIHRocm93IG5ldyBFcnJvcignUmFkaXggb3V0IG9mIHJhbmdlJyk7XG4gIH1cbiAgaWYgKGxlbiA9PT0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlplcm8gbGVuZ3RoIEJpZ0ludGVnZXJcIik7XG4gIH1cbiAgdmFyIHNpZ24gPSAxO1xuICB2YXIgaW5kZXgxID0gdmFsLmxhc3RJbmRleE9mKCctJyk7XG4gIHZhciBpbmRleDIgPSB2YWwubGFzdEluZGV4T2YoJysnKTtcbiAgaWYgKChpbmRleDEgKyBpbmRleDIpIDw9IC0xKSB7XG4gICAgaWYgKGluZGV4MSA9PT0gMCB8fCBpbmRleDIgPT09IDApIHtcbiAgICAgIGN1cnNvciA9IDE7XG4gICAgICBpZiAobGVuID09PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlplcm8gbGVuZ3RoIEJpZ0ludGVnZXJcIik7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChpbmRleDEgPT09IDApIHtcbiAgICAgIHNpZ24gPSAtMTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSWxsZWdhbCBlbWJlZGRlZCBzaWduIGNoYXJhY3RlclwiKTtcbiAgfVxuICB2YXIgX2JpZ0ludGVnZXIgPSBuZXcgQmlnSW50ZWdlcigpO1xuICAvKui3s+i/h+WJjeWvvOeahDDvvIzlpoLmnpzlhajpg6jmmK8w77yM55u05o6l5YKo5a2YWkVSTy5tYWcqL1xuICAvLyBTa2lwIGxlYWRpbmcgemVyb3MgYW5kIGNvbXB1dGUgbnVtYmVyIG9mIGRpZ2l0cyBpbiBtYWduaXR1ZGVcbiAgd2hpbGUgKGN1cnNvciA8IGxlbiAmJiBwYXJzZUludCh2YWwuc3Vic3RyaW5nKGN1cnNvciArIDEsIDEpLCByYWRpeCkgPT09IDApIHtcbiAgICBjdXJzb3IrKztcbiAgfVxuICBpZiAoY3Vyc29yID09PSBsZW4pIHtcbiAgICAvLyBfYmlnSW50ZWdlci5zaWdudW0gPSAwO1xuICAgIC8vIF9iaWdJbnRlZ2VyLm1hZyA9IG5ldyBCdWZmZXIoWzBdKTtcbiAgICByZXR1cm4gWkVSTztcbiAgfVxuICBudW1EaWdpdHMgPSBsZW4gLSBjdXJzb3I7XG4gIF9iaWdJbnRlZ2VyLnNpZ251bSA9IHNpZ247XG4gIC8vIFByZS1hbGxvY2F0ZSBhcnJheSBvZiBleHBlY3RlZCBzaXplLiBNYXkgYmUgdG9vIGxhcmdlIGJ1dCBjYW5cbiAgLy8gbmV2ZXIgYmUgdG9vIHNtYWxsLiBUeXBpY2FsbHkgZXhhY3QuXG4gIHZhciBudW1CaXRzID0gcGFyc2VJbnQoKChudW1EaWdpdHMgKiBiaXRzUGVyRGlnaXRbcmFkaXhdKSA+Pj4gMTApICsgMSwgMTApO1xuICB2YXIgbnVtV29yZHMgPSAobnVtQml0cyArIDMxKSA+Pj4gNTtcbiAgLy8g5a2Y5YKo6L2s5o2i5ZCO55qE5pWw5a2XXG4gIHZhciBtYWduaXR1ZGUgPSBDb21tb24uaW50QXJyYXkobnVtV29yZHMpO1xuICAvLyBmb3IgKHZhciBpID0gMDsgaSA8IG51bVdvcmRzOyBpKyspXG4gICAgLy8gbWFnbml0dWRlW2ldID0gMDtcblxuICB2YXIgZmlyc3RHcm91cExlbiA9IG51bURpZ2l0cyAlIGRpZ2l0c1BlckludFtyYWRpeF07XG4gIGlmIChmaXJzdEdyb3VwTGVuID09PSAwKVxuICAgIGZpcnN0R3JvdXBMZW4gPSBkaWdpdHNQZXJJbnRbcmFkaXhdO1xuXG4gIHZhciBncm91cCA9IHZhbC5zdWJzdHJpbmcoY3Vyc29yLCBjdXJzb3IgKz0gZmlyc3RHcm91cExlbik7XG4gIFxuICBtYWduaXR1ZGVbbnVtV29yZHMgLSAxXSA9IHBhcnNlSW50KGdyb3VwLCByYWRpeCk7XG4gIGlmIChtYWduaXR1ZGVbbnVtV29yZHMgLSAxXSA8IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSWxsZWdhbCBkaWdpdFwiKTtcblxuICAvLyBQcm9jZXNzIHJlbWFpbmluZyBkaWdpdCBncm91cHNcbiAgdmFyIHN1cGVyUmFkaXggPSBpbnRSYWRpeFtyYWRpeF07XG4gIHZhciBncm91cFZhbCA9IDA7XG4gIHdoaWxlIChjdXJzb3IgPCBsZW4pIHtcbiAgICAgIGdyb3VwID0gdmFsLnN1YnN0cmluZyhjdXJzb3IsIGN1cnNvciArPSBkaWdpdHNQZXJJbnRbcmFkaXhdKTtcbiAgICAgIGdyb3VwVmFsID0gcGFyc2VJbnQoZ3JvdXAsIHJhZGl4KTtcblxuICAgICAgaWYgKGdyb3VwVmFsIDwgMClcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbGxlZ2FsIGRpZ2l0XCIpO1xuICAgICAgX2JpZ0ludGVnZXIuX2Rlc3RydWN0aXZlTXVsQWRkKG1hZ25pdHVkZSwgc3VwZXJSYWRpeCwgZ3JvdXBWYWwpO1xuICB9XG4gIFxuICBfYmlnSW50ZWdlci5tYWcgPSB0cnVzdGVkU3RyaXBMZWFkaW5nWmVyb0ludHMobWFnbml0dWRlKTtcbiAgcmV0dXJuIF9iaWdJbnRlZ2VyO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgY29weSBvZiB0aGUgaW5wdXQgYXJyYXkgc3RyaXBwZWQgb2YgYW55IGxlYWRpbmcgemVybyBieXRlcy5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuX3N0cmlwTGVhZGluZ1plcm9CeXRlcyA9IGZ1bmN0aW9uIChhKSB7XG4gIHZhciBieXRlTGVuZ3RoID0gYS5sZW5ndGg7XG4gIHZhciBrZWVwO1xuXG4gIC8vIEZpbmQgZmlyc3Qgbm9uemVybyBieXRlXG4gIGZvciAoa2VlcCA9IDA7IGtlZXAgPCBieXRlTGVuZ3RoICYmIGFba2VlcF0gPT09IDA7IGtlZXArKylcbiAgICAgIDtcblxuICAvLyBBbGxvY2F0ZSBuZXcgYXJyYXkgYW5kIGNvcHkgcmVsZXZhbnQgcGFydCBvZiBpbnB1dCBhcnJheVxuICB2YXIgaW50TGVuZ3RoID0gKChieXRlTGVuZ3RoIC0ga2VlcCkgKyAzKSA+Pj4gMjtcbiAgdmFyIHJlc3VsdCA9IENvbW1vbi5pbnRBcnJheShpbnRMZW5ndGgpO1xuICB2YXIgYiA9IGJ5dGVMZW5ndGggLSAxO1xuICBmb3IgKHZhciBpID0gaW50TGVuZ3RoLTE7IGkgPj0gMDsgaS0tKSB7XG4gICAgcmVzdWx0W2ldID0gYVtiLS1dICYgMHhmZjtcbiAgICB2YXIgYnl0ZXNSZW1haW5pbmcgPSBiIC0ga2VlcCArIDE7XG4gICAgdmFyIGJ5dGVzVG9UcmFuc2ZlciA9IE1hdGgubWluKDMsIGJ5dGVzUmVtYWluaW5nKTtcbiAgICBmb3IgKHZhciBqPTg7IGogPD0gKGJ5dGVzVG9UcmFuc2ZlciA8PCAzKTsgaiArPSA4KVxuICAgICAgcmVzdWx0W2ldIHw9ICgoYVtiLS1dICYgMHhmZikgPDwgaik7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gTXVsdGlwbHkgeCBhcnJheSB0aW1lcyB3b3JkIHkgaW4gcGxhY2UsIGFuZCBhZGQgd29yZCB6XG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5fZGVzdHJ1Y3RpdmVNdWxBZGQgPSBmdW5jdGlvbiAoeCwgeSwgeikge1xuICAvLyBQZXJmb3JtIHRoZSBtdWx0aXBsaWNhdGlvbiB3b3JkIGJ5IHdvcmRcbiAgdmFyIHlsb25nID0gTG9uZy5mcm9tTnVtYmVyKHkgPj4+IDMyKTtcbiAgdmFyIHpsb25nID0geiA+Pj4gMzI7XG4gIHZhciBsZW4gPSB4Lmxlbmd0aDtcbiAgdmFyIHByb2R1Y3QgPSBMb25nLlpFUk87XG4gIHZhciBjYXJyeSA9IDA7XG4gIGZvciAodmFyIGkgPSBsZW4tMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBcbiAgICBwcm9kdWN0ID0geWxvbmcubXVsdGlwbHkoIExvbmcuZnJvbU51bWJlcih4W2ldID4+PiAzMikgKS5hZGQoTG9uZy5mcm9tSW50KGNhcnJ5KSk7XG4gICAgeFtpXSA9IHByb2R1Y3QubG93O1xuICAgIGNhcnJ5ID0gcHJvZHVjdC5oaWdoO1xuICB9XG4gIC8vIFBlcmZvcm0gdGhlIGFkZGl0aW9uXG4gIHZhciBzdW0gPSAoeFtsZW4gLSAxXSA+Pj4gMzIpICsgemxvbmc7XG4gIHN1bSA9IExvbmcuZnJvbU51bWJlcihzdW0pO1xuICB4W2xlbi0xXSA9IHN1bS5sb3c7XG4gIGNhcnJ5ID0gc3VtLmhpZ2g7XG4gIGZvciAodmFyIGkgPSBsZW4gLSAyIDsgaSA+PSAwOyBpLS0pIHtcbiAgICBzdW0gPSBMb25nLmZyb21OdW1iZXIoKHhbaV0gPj4+IDMyKSArIGNhcnJ5KTtcbiAgICB4W2ldID0gc3VtLmxvdztcbiAgICBjYXJyeSA9IHN1bS5oaWdoO1xuICB9XG5cbn07XG5cbmZ1bmN0aW9uIHRydXN0ZWRTdHJpcExlYWRpbmdaZXJvSW50cyh2YWwpIHtcbiAgdmFyIHZsZW4gPSB2YWwubGVuZ3RoO1xuICB2YXIga2VlcDtcbiAgLy8gRmluZCBmaXJzdCBub256ZXJvIGJ5dGVcbiAgZm9yIChrZWVwID0gMDsga2VlcCA8IHZsZW4gJiYgdmFsW2tlZXBdID09IDA7IGtlZXArKylcbiAgICAgIDtcbiAgcmV0dXJuIGtlZXAgPT0gMCA/IHZhbCA6IENvbW1vbi5jb3B5T2ZSYW5nZSh2YWwsIGtlZXAsIHZsZW4pO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgYml0cyBpbiB0aGUgbWluaW1hbCB0d28ncy1jb21wbGVtZW50XG4gKiByZXByZXNlbnRhdGlvbiBvZiB0aGlzIEJpZ0ludGVnZXIsIDxpPmV4Y2x1ZGluZzwvaT4gYSBzaWduIGJpdC5cbiAqIEZvciBwb3NpdGl2ZSBCaWdJbnRlZ2VycywgdGhpcyBpcyBlcXVpdmFsZW50IHRvIHRoZSBudW1iZXIgb2YgYml0cyBpblxuICogdGhlIG9yZGluYXJ5IGJpbmFyeSByZXByZXNlbnRhdGlvbi4gIChDb21wdXRlc1xuICoge0Bjb2RlIChjZWlsKGxvZzIodGhpcyA8IDAgPyAtdGhpcyA6IHRoaXMrMSkpKX0uKVxuICpcbiAqIEByZXR1cm4gbnVtYmVyIG9mIGJpdHMgaW4gdGhlIG1pbmltYWwgdHdvJ3MtY29tcGxlbWVudFxuICogICAgICAgICByZXByZXNlbnRhdGlvbiBvZiB0aGlzIEJpZ0ludGVnZXIsIDxpPmV4Y2x1ZGluZzwvaT4gYSBzaWduIGJpdC5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuYml0TGVuZ3RoID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbiA9IHRoaXMuX2JpdExlbmd0aCAtIDE7XG4gIGlmIChuID09IC0xKSB7IC8vIGJpdExlbmd0aCBub3QgaW5pdGlhbGl6ZWQgeWV0XG4gICAgdmFyIG0gPSB0aGlzLm1hZztcbiAgICB2YXIgbGVuID0gbS5sZW5ndGg7XG4gICAgaWYgKGxlbiA9PSAwKSB7XG4gICAgICBuID0gMDsgLy8gb2Zmc2V0IGJ5IG9uZSB0byBpbml0aWFsaXplXG4gICAgfSAgZWxzZSB7XG4gICAgICAvLyBDYWxjdWxhdGUgdGhlIGJpdCBsZW5ndGggb2YgdGhlIG1hZ25pdHVkZVxuICAgICAgdmFyIG1hZ0JpdExlbmd0aCA9ICgobGVuIC0gMSkgPDwgNSkgKyBCaWdJbnRlZ2VyTGliLmJpdExlbmd0aEZvckludCh0aGlzLm1hZ1swXSk7XG4gICAgICAgaWYgKHRoaXMuc2lnbnVtIDwgMCkge1xuICAgICAgICAgICAvLyBDaGVjayBpZiBtYWduaXR1ZGUgaXMgYSBwb3dlciBvZiB0d29cbiAgICAgICAgICAgdmFyIHBvdzIgPSAoSW50ZWdlci5iaXRDb3VudCh0aGlzLm1hZ1swXSkgPT0gMSk7XG4gICAgICAgICAgIGZvcih2YXIgaT0xOyBpPCBsZW4gJiYgcG93MjsgaSsrKVxuICAgICAgICAgICAgICAgcG93MiA9ICh0aGlzLm1hZ1tpXSA9PSAwKTtcblxuICAgICAgICAgICBuID0gKHBvdzIgPyBtYWdCaXRMZW5ndGggLTEgOiBtYWdCaXRMZW5ndGgpO1xuICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIG4gPSBtYWdCaXRMZW5ndGg7XG4gICAgICAgfVxuICAgIH1cbiAgICBiaXRMZW5ndGggPSBuICsgMTtcbiAgfVxuICByZXR1cm4gbjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgYnl0ZSBhcnJheSBjb250YWluaW5nIHRoZSB0d28ncy1jb21wbGVtZW50XG4gKiByZXByZXNlbnRhdGlvbiBvZiB0aGlzIEJpZ0ludGVnZXIuICBUaGUgYnl0ZSBhcnJheSB3aWxsIGJlIGluXG4gKiA8aT5iaWctZW5kaWFuPC9pPiBieXRlLW9yZGVyOiB0aGUgbW9zdCBzaWduaWZpY2FudCBieXRlIGlzIGluXG4gKiB0aGUgemVyb3RoIGVsZW1lbnQuICBUaGUgYXJyYXkgd2lsbCBjb250YWluIHRoZSBtaW5pbXVtIG51bWJlclxuICogb2YgYnl0ZXMgcmVxdWlyZWQgdG8gcmVwcmVzZW50IHRoaXMgQmlnSW50ZWdlciwgaW5jbHVkaW5nIGF0XG4gKiBsZWFzdCBvbmUgc2lnbiBiaXQsIHdoaWNoIGlzIHtAY29kZSAoY2VpbCgodGhpcy5iaXRMZW5ndGgoKSArXG4gKiAxKS84KSl9LiAgKFRoaXMgcmVwcmVzZW50YXRpb24gaXMgY29tcGF0aWJsZSB3aXRoIHRoZVxuICoge0BsaW5rICNCaWdJbnRlZ2VyKGJ5dGVbXSkgKGJ5dGVbXSl9IGNvbnN0cnVjdG9yLilcbiAqXG4gKiBAcmV0dXJuIGEgYnl0ZSBhcnJheSBjb250YWluaW5nIHRoZSB0d28ncy1jb21wbGVtZW50IHJlcHJlc2VudGF0aW9uIG9mXG4gKiAgICAgICAgIHRoaXMgQmlnSW50ZWdlci5cbiAqIEBzZWUgICAgI0JpZ0ludGVnZXIoYnl0ZVtdKVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS50b0J1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGJ5dGVMZW4gPSBwYXJzZUludCh0aGlzLmJpdExlbmd0aCgpIC8gOCwgMTApICsgMTtcbiAgdmFyIGJ5dGVBcnJheSA9IG5ldyBCdWZmZXIoYnl0ZUxlbik7XG4gIGJ5dGVBcnJheS5maWxsKDB4ZmYpO1xuXG4gIGZvciAodmFyIGkgPSBieXRlTGVuIC0gMSwgYnl0ZXNDb3BpZWQgPSA0LCBuZXh0SW50ID0gMCwgaW50SW5kZXggPSAwOyBpID49IDA7IGktLSkge1xuICAgIGlmIChieXRlc0NvcGllZCA9PSA0KSB7XG4gICAgICAgIG5leHRJbnQgPSB0aGlzLl9nZXRJbnQoaW50SW5kZXgrKyk7XG4gICAgICAgIGJ5dGVzQ29waWVkID0gMTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0SW50ID4+Pj0gODtcbiAgICAgICAgYnl0ZXNDb3BpZWQrKztcbiAgICB9XG4gICAgYnl0ZUFycmF5W2ldID0gbmV4dEludDtcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiB0aGlzXG4gKiBCaWdJbnRlZ2VyLlxuICpcbiAqIEByZXR1cm4ge0Bjb2RlIGFicyh0aGlzKX1cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuYWJzID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5zaWdudW0gPj0gMCA/IHRoaXMgOiB0aGlzLm5lZ2F0ZSgpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpcyB7QGNvZGUgKC10aGlzKX0uXG4gKlxuICogQHJldHVybiB7QGNvZGUgLXRoaXN9XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLm5lZ2F0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyh0aGlzLm1hZywgLXRoaXMuc2lnbnVtKTtcbn07XG5cbi8qKlxuKiBSZXR1cm5zIGEgY29weSBvZiB0aGUgaW5wdXQgYXJyYXkgc3RyaXBwZWQgb2YgYW55IGxlYWRpbmcgemVybyBieXRlcy5cbiovXG5mdW5jdGlvbiBzdHJpcExlYWRpbmdaZXJvSW50cyh2YWwpIHtcbiAgdmFyIHZsZW4gPSB2YWwubGVuZ3RoO1xuICB2YXIga2VlcDtcbiAgLy8gRmluZCBmaXJzdCBub256ZXJvIGJ5dGVcbiAgZm9yIChrZWVwID0gMDsga2VlcCA8IHZsZW4gJiYgdmFsW2tlZXBdID09IDA7IGtlZXArKylcbiAgICAgIDtcbiAgcmV0dXJuIENvbW1vbi5jb3B5T2ZSYW5nZSh2YWwsIGtlZXAsIHZsZW4pO1xufVxuXG5mdW5jdGlvbiBfZnJvbU1hZyhzaWdudW0sIG1hZ25pdHVkZSkge1xuICB2YXIgX2JpZ0ludGVnZXIgPSBuZXcgQmlnSW50ZWdlcigpO1xuICBfYmlnSW50ZWdlci5tYWcgPSBzdHJpcExlYWRpbmdaZXJvSW50cyhtYWduaXR1ZGUpO1xuXG4gIGlmIChzaWdudW0gPCAtMSB8fCBzaWdudW0gPiAxKVxuICAgICAgdGhyb3cobmV3IEVycm9yKFwiSW52YWxpZCBzaWdudW0gdmFsdWVcIikpO1xuXG4gIGlmIChfYmlnSW50ZWdlci5tYWcubGVuZ3RoPT0wKSB7XG4gICAgICBfYmlnSW50ZWdlci5zaWdudW0gPSAwO1xuICB9IGVsc2Uge1xuICAgICAgaWYgKHNpZ251bSA9PSAwKVxuICAgICAgICAgIHRocm93KG5ldyBFcnJvcihcInNpZ251bS1tYWduaXR1ZGUgbWlzbWF0Y2hcIikpO1xuICAgICAgX2JpZ0ludGVnZXIuc2lnbnVtID0gc2lnbnVtO1xuICB9XG4gIHJldHVybiBfYmlnSW50ZWdlcjtcbn07XG5cbkJpZ0ludGVnZXIuZnJvbU1hZyA9IGZ1bmN0aW9uIChtYWduaXR1ZGUsIHNpZ251bSkge1xuICBcbiAgdmFyIF9iaWdJbnRlZ2VyID0gbmV3IEJpZ0ludGVnZXIoKTtcblxuICBpZiAodHlwZW9mIHNpZ251bSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyBAc2VlIEJpZ0ludGVnZXIoaW50W10gdmFsKSBcbiAgICBpZiAobWFnbml0dWRlLmxlbmd0aCA9PSAwKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiWmVybyBsZW5ndGggQmlnSW50ZWdlclwiKTtcblxuICAgIGlmIChtYWduaXR1ZGVbMF0gPCAwKSB7XG4gICAgICBfYmlnSW50ZWdlci5tYWcgPSBtYWtlUG9zaXRpdmUoKTtcbiAgICAgIF9iaWdJbnRlZ2VyLnNpZ251bSA9IC0xO1xuICAgIH0gZWxzZSB7XG4gICAgICBfYmlnSW50ZWdlci5tYWcgPSB0cnVzdGVkU3RyaXBMZWFkaW5nWmVyb0ludHMobWFnbml0dWRlKTtcbiAgICAgIF9iaWdJbnRlZ2VyLnNpZ251bSA9IF9iaWdJbnRlZ2VyLmxlbmd0aCA9PT0gMCA/IDAgOiAxXG4gICAgfVxuXG4gIH0gZWxzZSB7XG4gICAgLy8gQHNlZSBCaWdJbnRlZ2VyKGludFtdIG1hZ25pdHVkZSwgaW50IHNpZ251bSkgICAgXG4gICAgX2JpZ0ludGVnZXIuc2lnbnVtID0gKG1hZ25pdHVkZS5sZW5ndGggPT09IDAgPyAwIDogc2lnbnVtKTtcbiAgICBfYmlnSW50ZWdlci5tYWcgPSBtYWduaXR1ZGU7XG4gICAgXG4gIH1cblxuICByZXR1cm4gX2JpZ0ludGVnZXI7ICBcbiAgXG59O1xuXG4vKiBSZXR1cm5zIGFuIGludCBvZiBzaWduIGJpdHMgKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLl9zaWduSW50ID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5zaWdudW0gPCAwID8gLTEgOiAwO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBpbnQgdGhhdCBjb250YWlucyB0aGUgZmlyc3Qgbm9uemVybyBpbnQgaW4gdGhlXG4gKiBsaXR0bGUtZW5kaWFuIGJpbmFyeSByZXByZXNlbnRhdGlvbiBvZiB0aGUgbWFnbml0dWRlIChpbnQgMCBpcyB0aGVcbiAqIGxlYXN0IHNpZ25pZmljYW50KS4gSWYgdGhlIG1hZ25pdHVkZSBpcyB6ZXJvLCByZXR1cm4gdmFsdWUgaXMgdW5kZWZpbmVkLlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5fZmlyc3ROb256ZXJvSW50TnVtID0gZnVuY3Rpb24gKCkge1xuIHZhciBmbiA9IHRoaXMuZmlyc3ROb256ZXJvSW50TnVtIC0gMjtcbiBpZiAoZm4gPT0gLTIpIHsgLy8gZmlyc3ROb256ZXJvSW50TnVtIG5vdCBpbml0aWFsaXplZCB5ZXRcbiAgIGZuID0gMDtcblxuICAgLy8gU2VhcmNoIGZvciB0aGUgZmlyc3Qgbm9uemVybyBpbnRcbiAgIHZhciBpO1xuICAgdmFyIG1sZW4gPSB0aGlzLm1hZy5sZW5ndGg7XG4gICBmb3IgKGkgPSBtbGVuIC0gMTsgaSA+PSAwICYmIHRoaXMubWFnW2ldID09IDA7IGktLSlcbiAgICAgICA7XG4gICBmbiA9IG1sZW4gLSBpIC0gMTtcbiAgIHRoaXMuZmlyc3ROb256ZXJvSW50TnVtID0gZm4gKyAyOyAvLyBvZmZzZXQgYnkgdHdvIHRvIGluaXRpYWxpemVcbiB9XG4gcmV0dXJuIGZuO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHNwZWNpZmllZCBpbnQgb2YgdGhlIGxpdHRsZS1lbmRpYW4gdHdvJ3MgY29tcGxlbWVudFxuICogcmVwcmVzZW50YXRpb24gKGludCAwIGlzIHRoZSBsZWFzdCBzaWduaWZpY2FudCkuICBUaGUgaW50IG51bWJlciBjYW5cbiAqIGJlIGFyYml0cmFyaWx5IGhpZ2ggKHZhbHVlcyBhcmUgbG9naWNhbGx5IHByZWNlZGVkIGJ5IGluZmluaXRlbHkgbWFueVxuICogc2lnbiBpbnRzKS5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuX2dldEludCA9IGZ1bmN0aW9uIChuKSB7XG4gIGlmIChuIDwgMClcbiAgICByZXR1cm4gMDtcbiAgaWYgKG4gPj0gdGhpcy5tYWcubGVuZ3RoKVxuICAgIHJldHVybiB0aGlzLl9zaWduSW50KCk7XG5cbiAgdmFyIG1hZ0ludCA9IHRoaXMubWFnW3RoaXMubWFnLmxlbmd0aCAtIG4gLSAxXTtcblxuICByZXR1cm4gKHRoaXMuc2lnbnVtID49IDAgPyBtYWdJbnQgOiAobiA8PSB0aGlzLl9maXJzdE5vbnplcm9JbnROdW0oKSA/IC1tYWdJbnQgOiB+bWFnSW50KSk7XG59XG5cbi8qKlxuICogUmlnaHQgc2hpZnQgdGhpcyBNdXRhYmxlQmlnSW50ZWdlciBuIGJpdHMsIHdoZXJlIG4gaXNcbiAqIGxlc3MgdGhhbiAzMi5cbiAqIEFzc3VtZXMgdGhhdCBpbnRMZW4gPiAwLCBuID4gMCBmb3Igc3BlZWRcbiAqL1xuZnVuY3Rpb24gcHJpbWl0aXZlUmlnaHRTaGlmdChuKSB7XG4gIC8vIGludFtdXG4gIHZhciB2YWwgPSB0aGlzLnZhbHVlO1xuICB2YXIgbjIgPSAzMiAtIG47XG4gIGZvciAodmFyIGkgPSBvZmZzZXQgKyBpbnRMZW4gLSAxLCBjID0gdmFsW2ldOyBpID4gb2Zmc2V0OyBpLS0pIHtcbiAgICB2YXIgYiA9IGM7XG4gICAgYyA9IHZhbFtpIC0gMV07XG4gICAgdmFsW2ldID0gKGMgPDwgbjIpIHwgKGIgPj4+IG4pO1xuICB9XG4gIHZhbFtvZmZzZXRdID4+Pj0gbjtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyB0aGlzIEJpZ0ludGVnZXIgdG8gYSB7QGNvZGUgbG9uZ30uICBUaGlzXG4gKiBjb252ZXJzaW9uIGlzIGFuYWxvZ291cyB0byBhXG4gKiA8aT5uYXJyb3dpbmcgcHJpbWl0aXZlIGNvbnZlcnNpb248L2k+IGZyb20ge0Bjb2RlIGxvbmd9IHRvXG4gKiB7QGNvZGUgaW50fSBhcyBkZWZpbmVkIGluIHNlY3Rpb24gNS4xLjMgb2ZcbiAqIDxjaXRlPlRoZSBKYXZhJnRyYWRlOyBMYW5ndWFnZSBTcGVjaWZpY2F0aW9uPC9jaXRlPjpcbiAqIGlmIHRoaXMgQmlnSW50ZWdlciBpcyB0b28gYmlnIHRvIGZpdCBpbiBhXG4gKiB7QGNvZGUgbG9uZ30sIG9ubHkgdGhlIGxvdy1vcmRlciA2NCBiaXRzIGFyZSByZXR1cm5lZC5cbiAqIE5vdGUgdGhhdCB0aGlzIGNvbnZlcnNpb24gY2FuIGxvc2UgaW5mb3JtYXRpb24gYWJvdXQgdGhlXG4gKiBvdmVyYWxsIG1hZ25pdHVkZSBvZiB0aGUgQmlnSW50ZWdlciB2YWx1ZSBhcyB3ZWxsIGFzIHJldHVybiBhXG4gKiByZXN1bHQgd2l0aCB0aGUgb3Bwb3NpdGUgc2lnbi5cbiAqXG4gKiBAcmV0dXJuIHRoaXMgQmlnSW50ZWdlciBjb252ZXJ0ZWQgdG8gYSB7QGNvZGUgbG9uZ30uXG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLmxvbmdWYWx1ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHJlc3VsdCA9IExvbmcuWkVSTztcbiAgZm9yICh2YXIgaSA9IDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnNoaWZ0TGVmdCgzMikuYWRkKExvbmcuZnJvbU51bWJlcih0aGlzLl9nZXRJbnQoaSkgPj4+IDMyKSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbiAgLy8gcmV0dXJuIG5ldyBMb25nKHRoaXMuX2dldEludCgwKSwgdGhpcy5fZ2V0SW50KDEpLCBmYWxzZSk7IFxufVxuXG5CaWdJbnRlZ2VyLmZyb21NdXRhYmxlQmlnSW50ZWdlciA9IGZ1bmN0aW9uIChtYiwgc2lnbikge1xuICBpZiAobWIuaW50TGVuID09PSAwIHx8IHNpZ24gPT09IDApIHtcbiAgICByZXR1cm4gWkVSTztcbiAgfVxuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTWFnKG1iLmdldE1hZ25pdHVkZUFycmF5KCksIHNpZ24pO1xufVxuXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChyYWRpeCkge1xuICBpZiAoIXJhZGl4KSB7XG4gICAgcmFkaXggPSAxMDtcbiAgfVxuXG4gIGlmICh0aGlzLnNpZ251bSA9PSAwKVxuICAgIHJldHVybiBcIjBcIjtcbiAgaWYgKHJhZGl4IDwgTUlOX1JBRElYIHx8IHJhZGl4ID4gTUFYX1JBRElYKVxuICAgIHJhZGl4ID0gMTA7XG5cbiAgLy8gQ29tcHV0ZSB1cHBlciBib3VuZCBvbiBudW1iZXIgb2YgZGlnaXQgZ3JvdXBzIGFuZCBhbGxvY2F0ZSBzcGFjZVxuICB2YXIgbWF4TnVtRGlnaXRHcm91cHMgPSBwYXJzZUludCgoNCAqIHRoaXMubWFnLmxlbmd0aCArIDYpIC8gNyk7XG4gIC8vIFN0cmluZ1xuICB2YXIgZGlnaXRHcm91cCA9IENvbW1vbi5pbnRBcnJheShtYXhOdW1EaWdpdEdyb3Vwcyk7XG4gIC8vIHZhciBNdXRhYmxlQmlnSW50ZWdlciA9IHJlcXVpcmUoJy4vTXV0YWJsZUJpZ0ludGVnZXInKTtcbiAgLy8gVHJhbnNsYXRlIG51bWJlciB0byBzdHJpbmcsIGEgZGlnaXQgZ3JvdXAgYXQgYSB0aW1lXG4gIHZhciB0bXAgPSB0aGlzLmFicygpO1xuICB2YXIgbnVtR3JvdXBzID0gMDtcbiAgd2hpbGUgKHRtcC5zaWdudW0gIT0gMCkge1xuICAgIHZhciBkID0gQmlnSW50ZWdlci5mcm9tTG9uZyhsb25nUmFkaXhbcmFkaXhdKTtcbiAgICB2YXIgcSA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcigpO1xuICAgIHZhciBhID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHRtcC5tYWcpO1xuICAgIHZhciBiID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKGQubWFnKTtcbiAgICB2YXIgciA9IGEuZGl2aWRlKGIsIHEpO1xuICAgIHZhciBxMiA9IEJpZ0ludGVnZXIuZnJvbU11dGFibGVCaWdJbnRlZ2VyKHEsIHRtcC5zaWdudW0gKiBkLnNpZ251bSk7XG4gICAgdmFyIHIyID0gQmlnSW50ZWdlci5mcm9tTXV0YWJsZUJpZ0ludGVnZXIociwgdG1wLnNpZ251bSAqIGQuc2lnbnVtKTtcbiAgICBkaWdpdEdyb3VwW251bUdyb3VwcysrXSA9IENvbW1vbi5sb25nU3RyaW5nKHIyLmxvbmdWYWx1ZSgpLCByYWRpeCk7XG4gICAgdG1wID0gcTI7XG4gIH1cblxuICAvLyBQdXQgc2lnbiAoaWYgYW55KSBhbmQgZmlyc3QgZGlnaXQgZ3JvdXAgaW50byByZXN1bHQgYnVmZmVyXG4gIC8vIHZhciBidWYgPSBuZXcgU3RyaW5nQnVpbGRlcihudW1Hcm91cHMqZGlnaXRzUGVyTG9uZ1tyYWRpeF0rMSk7XG4gIHZhciBidWYgPSBbXTtcbiAgaWYgKHRoaXMuc2lnbnVtIDwgMClcbiAgICBidWYucHVzaCgnLScpO1xuICBidWYucHVzaChkaWdpdEdyb3VwW251bUdyb3Vwcy0xXSk7XG5cbiAgLy8gQXBwZW5kIHJlbWFpbmluZyBkaWdpdCBncm91cHMgcGFkZGVkIHdpdGggbGVhZGluZyB6ZXJvc1xuICBmb3IgKHZhciBpID0gbnVtR3JvdXBzIC0gMjsgaSA+PSAwOyBpLS0pIHtcbiAgICAvLyBQcmVwZW5kIChhbnkpIGxlYWRpbmcgemVyb3MgZm9yIHRoaXMgZGlnaXQgZ3JvdXBcbiAgICB2YXIgbnVtTGVhZGluZ1plcm9zID0gZGlnaXRzUGVyTG9uZ1tyYWRpeF0tZGlnaXRHcm91cFtpXS5sZW5ndGg7XG4gICAgaWYgKG51bUxlYWRpbmdaZXJvcyAhPSAwKVxuICAgICAgICBidWYucHVzaCh6ZXJvc1tudW1MZWFkaW5nWmVyb3NdKTtcbiAgICBidWYucHVzaChkaWdpdEdyb3VwW2ldKTtcbiAgfVxuICBcbiAgcmV0dXJuIGJ1Zi5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBBZGRzIHRoZSBjb250ZW50cyBvZiB0aGUgaW50IGFycmF5cyB4IGFuZCB5LiBUaGlzIG1ldGhvZCBhbGxvY2F0ZXNcbiAqIGEgbmV3IGludCBhcnJheSB0byBob2xkIHRoZSBhbnN3ZXIgYW5kIHJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhhdFxuICogYXJyYXkuXG4gKi9cbmZ1bmN0aW9uIGFkZCh4LCB5KSB7XG4gIC8vIElmIHggaXMgc2hvcnRlciwgc3dhcCB0aGUgdHdvIGFycmF5c1xuICBpZiAoeC5sZW5ndGggPCB5Lmxlbmd0aCkge1xuICAgIHZhciB0bXAgPSB4O1xuICAgIHggPSB5O1xuICAgIHkgPSB0bXA7XG4gIH1cblxuICB2YXIgeEluZGV4ID0geC5sZW5ndGg7XG4gIHZhciB5SW5kZXggPSB5Lmxlbmd0aDtcbiAgdmFyIHJlc3VsdCA9IENvbW1vbi5pbnRBcnJheSh4SW5kZXgpO1xuICAvLyBsb25nXG4gIHZhciBzdW0gPSBMb25nLlpFUk87XG5cbiAgLy8gQWRkIGNvbW1vbiBwYXJ0cyBvZiBib3RoIG51bWJlcnNcbiAgd2hpbGUoeUluZGV4ID4gMCkge1xuICAgIC8vIHN1bSA9ICh4Wy0teEluZGV4XSAmIExPTkdfTUFTSykgKyAoeVstLXlJbmRleF0gJiBMT05HX01BU0spICsgKHN1bSA+Pj4gMzIpO1xuICAgIHN1bSA9IExvbmcuZnJvbU51bWJlcih4Wy0teEluZGV4XSA+Pj4gMzIpLmFkZChMb25nLmZyb21OdW1iZXIoeVstLXlJbmRleF0gPj4+IDMyKSkuYWRkKHN1bS5zaGlmdFJpZ2h0KDMyKSk7XG4gICAgLy8gcmVzdWx0W3hJbmRleF0gPSAoaW50KXN1bTtcbiAgICByZXN1bHRbeEluZGV4XSA9IHN1bS5sb3c7XG4gIH1cblxuICAvLyBDb3B5IHJlbWFpbmRlciBvZiBsb25nZXIgbnVtYmVyIHdoaWxlIGNhcnJ5IHByb3BhZ2F0aW9uIGlzIHJlcXVpcmVkXG4gIHZhciBjYXJyeSA9IChzdW0uc2hpZnRSaWdodCgzMikudG9OdW1iZXIoKSAhPSAwKTtcbiAgd2hpbGUgKHhJbmRleCA+IDAgJiYgY2FycnkpXG4gICAgY2FycnkgPSAoKHJlc3VsdFstLXhJbmRleF0gPSB4W3hJbmRleF0gKyAxKSA9PSAwKTtcblxuICAvLyBDb3B5IHJlbWFpbmRlciBvZiBsb25nZXIgbnVtYmVyXG4gIHdoaWxlICh4SW5kZXggPiAwKVxuICAgIHJlc3VsdFstLXhJbmRleF0gPSB4W3hJbmRleF07XG5cbiAgLy8gR3JvdyByZXN1bHQgaWYgbmVjZXNzYXJ5XG4gIGlmIChjYXJyeSkge1xuICAgIHZhciBiaWdnZXIgPSBDb21tb24uaW50QXJyYXkocmVzdWx0Lmxlbmd0aCArIDEpO1xuICAgIENvbW1vbi5hcnJheWNvcHkocmVzdWx0LCAwLCBiaWdnZXIsIDEsIHJlc3VsdC5sZW5ndGgpO1xuICAgIGJpZ2dlclswXSA9IDB4MDE7XG4gICAgcmV0dXJuIGJpZ2dlcjtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogIFxuICogU3VidHJhY3RzIHRoZSBjb250ZW50cyBvZiB0aGUgc2Vjb25kIGludCBhcnJheXMgKGxpdHRsZSkgZnJvbSB0aGVcbiAqIGZpcnN0IChiaWcpLiAgVGhlIGZpcnN0IGludCBhcnJheSAoYmlnKSBtdXN0IHJlcHJlc2VudCBhIGxhcmdlciBudW1iZXJcbiAqIHRoYW4gdGhlIHNlY29uZC4gIFRoaXMgbWV0aG9kIGFsbG9jYXRlcyB0aGUgc3BhY2UgbmVjZXNzYXJ5IHRvIGhvbGQgdGhlXG4gKiBhbnN3ZXIuXG4gKi9cbmZ1bmN0aW9uIHN1YnRyYWN0KGJpZywgbGl0dGxlKSB7XG4gIHZhciBiaWdJbmRleCA9IGJpZy5sZW5ndGg7XG4gIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkoYmlnSW5kZXgpO1xuICB2YXIgbGl0dGxlSW5kZXggPSBsaXR0bGUubGVuZ3RoO1xuICAvLyBsb25nXG4gIHZhciBkaWZmZXJlbmNlID0gTG9uZy5aRVJPO1xuXG4gIC8vIFN1YnRyYWN0IGNvbW1vbiBwYXJ0cyBvZiBib3RoIG51bWJlcnNcbiAgd2hpbGUobGl0dGxlSW5kZXggPiAwKSB7XG4gICAgZGlmZmVyZW5jZSA9IExvbmcuZnJvbU51bWJlcihiaWdbLS1iaWdJbmRleF0gPj4+IDMyKS5zdWJ0cmFjdChMb25nLmZyb21OdW1iZXIobGl0dGxlWy0tbGl0dGxlSW5kZXhdID4+PiAzMikpLmFkZChkaWZmZXJlbmNlLnNoaWZ0UmlnaHQoMzIpKTtcbiAgICByZXN1bHRbYmlnSW5kZXhdID0gZGlmZmVyZW5jZS5sb3c7XG4gIH1cblxuICAvLyBTdWJ0cmFjdCByZW1haW5kZXIgb2YgbG9uZ2VyIG51bWJlciB3aGlsZSBib3Jyb3cgcHJvcGFnYXRlc1xuICB2YXIgYm9ycm93ID0gKGRpZmZlcmVuY2Uuc2hpZnRSaWdodCgzMikudG9OdW1iZXIoKSAhPSAwKTtcbiAgd2hpbGUgKGJpZ0luZGV4ID4gMCAmJiBib3Jyb3cpXG4gICAgYm9ycm93ID0gKChyZXN1bHRbLS1iaWdJbmRleF0gPSBiaWdbYmlnSW5kZXhdIC0gMSkgPT0gLTEpO1xuXG4gIC8vIENvcHkgcmVtYWluZGVyIG9mIGxvbmdlciBudW1iZXJcbiAgd2hpbGUgKGJpZ0luZGV4ID4gMClcbiAgICByZXN1bHRbLS1iaWdJbmRleF0gPSBiaWdbYmlnSW5kZXhdO1xuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMge0Bjb2RlICh0aGlzICsgdmFsKX0uXG4gKlxuICogQHBhcmFtICB2YWwgdmFsdWUgdG8gYmUgYWRkZWQgdG8gdGhpcyBCaWdJbnRlZ2VyLlxuICogQHJldHVybiB7QGNvZGUgdGhpcyArIHZhbH1cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbCkge1xuICBpZiAodmFsLnNpZ251bSA9PT0gMClcbiAgICByZXR1cm4gdGhpcztcbiAgaWYgKHRoaXMuc2lnbnVtID09PSAwKVxuICAgIHJldHVybiB2YWw7XG4gIGlmICh2YWwuc2lnbnVtID09PSB0aGlzLnNpZ251bSlcbiAgICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTWFnKGFkZCh0aGlzLm1hZywgdmFsLm1hZyksIHRoaXMuc2lnbnVtKTtcblxuICB2YXIgY21wID0gdGhpcy5jb21wYXJlTWFnbml0dWRlKHZhbCk7XG4gIGlmIChjbXAgPT0gMClcbiAgICByZXR1cm4gWkVSTztcbiAgdmFyIHJlc3VsdE1hZyA9IChjbXAgPiAwID8gc3VidHJhY3QodGhpcy5tYWcsIHZhbC5tYWcpIDogc3VidHJhY3QodmFsLm1hZywgdGhpcy5tYWcpKTtcbiAgcmVzdWx0TWFnID0gdHJ1c3RlZFN0cmlwTGVhZGluZ1plcm9JbnRzKHJlc3VsdE1hZyk7XG5cbiAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyhyZXN1bHRNYWcsIGNtcCA9PT0gdGhpcy5zaWdudW0gPyAxIDogLTEpO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMge0Bjb2RlICh0aGlzIC0gdmFsKX0uXG4gKlxuICogQHBhcmFtICB2YWwgdmFsdWUgdG8gYmUgc3VidHJhY3RlZCBmcm9tIHRoaXMgQmlnSW50ZWdlci5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgLSB2YWx9XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24gKHZhbCkge1xuICBpZiAodmFsLnNpZ251bSA9PSAwKVxuICAgIHJldHVybiB0aGlzO1xuICBpZiAodGhpcy5zaWdudW0gPT0gMClcbiAgICByZXR1cm4gdmFsLm5lZ2F0ZSgpO1xuICBpZiAodmFsLnNpZ251bSAhPSB0aGlzLnNpZ251bSlcbiAgICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTWFnKGFkZCh0aGlzLm1hZywgdmFsLm1hZyksIHRoaXMuc2lnbnVtKTtcblxuICB2YXIgY21wID0gdGhpcy5jb21wYXJlTWFnbml0dWRlKHZhbCk7XG4gIGlmIChjbXAgPT0gMClcbiAgICByZXR1cm4gWkVSTztcbiAgdmFyIHJlc3VsdE1hZyA9IChjbXAgPiAwID8gc3VidHJhY3QodGhpcy5tYWcsIHZhbC5tYWcpIDogc3VidHJhY3QodmFsLm1hZywgdGhpcy5tYWcpKTtcbiAgcmVzdWx0TWFnID0gdHJ1c3RlZFN0cmlwTGVhZGluZ1plcm9JbnRzKHJlc3VsdE1hZyk7XG4gIHJldHVybiBCaWdJbnRlZ2VyLmZyb21NYWcocmVzdWx0TWFnLCBjbXAgPT0gdGhpcy5zaWdudW0gPyAxIDogLTEpO1xufVxuXG4vKipcbiAqIENvbXBhcmVzIHRoZSBtYWduaXR1ZGUgYXJyYXkgb2YgdGhpcyBCaWdJbnRlZ2VyIHdpdGggdGhlIHNwZWNpZmllZFxuICogQmlnSW50ZWdlcidzLiBUaGlzIGlzIHRoZSB2ZXJzaW9uIG9mIGNvbXBhcmVUbyBpZ25vcmluZyBzaWduLlxuICpcbiAqIEBwYXJhbSB2YWwgQmlnSW50ZWdlciB3aG9zZSBtYWduaXR1ZGUgYXJyYXkgdG8gYmUgY29tcGFyZWQuXG4gKiBAcmV0dXJuIC0xLCAwIG9yIDEgYXMgdGhpcyBtYWduaXR1ZGUgYXJyYXkgaXMgbGVzcyB0aGFuLCBlcXVhbCB0byBvclxuICogICAgICAgICBncmVhdGVyIHRoYW4gdGhlIG1hZ25pdHVkZSBhcmF5IGZvciB0aGUgc3BlY2lmaWVkIEJpZ0ludGVnZXIncy5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuY29tcGFyZU1hZ25pdHVkZSA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgdmFyIG0xID0gdGhpcy5tYWc7XG4gIHZhciBsZW4xID0gbTEubGVuZ3RoO1xuICB2YXIgbTIgPSB2YWwubWFnO1xuICB2YXIgbGVuMiA9IG0yLmxlbmd0aDtcbiAgaWYgKGxlbjEgPCBsZW4yKVxuICAgIHJldHVybiAtMTtcbiAgaWYgKGxlbjEgPiBsZW4yKVxuICAgIHJldHVybiAxO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjE7IGkrKykge1xuICAgIHZhciBhID0gbTFbaV07XG4gICAgdmFyIGIgPSBtMltpXTtcbiAgICBpZiAoYSAhPSBiKVxuICAgICAgcmV0dXJuICgoYSA+Pj4gMzIpIDwgKGIgPj4+IDMyKSkgPyAtMSA6IDE7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbi8qKlxuICogTXVsdGlwbGllcyBpbnQgYXJyYXlzIHggYW5kIHkgdG8gdGhlIHNwZWNpZmllZCBsZW5ndGhzIGFuZCBwbGFjZXNcbiAqIHRoZSByZXN1bHQgaW50byB6LiBUaGVyZSB3aWxsIGJlIG5vIGxlYWRpbmcgemVyb3MgaW4gdGhlIHJlc3VsdGFudCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gbXVsdGlwbHlUb0xlbih4LCB4bGVuLCB5LCB5bGVuLCB6KSB7XG4gIHZhciB4c3RhcnQgPSB4bGVuIC0gMTtcbiAgdmFyIHlzdGFydCA9IHlsZW4gLSAxO1xuXG4gIGlmICh6ID09IG51bGwgfHwgei5sZW5ndGggPCAoeGxlbisgeWxlbikpXG4gICAgeiA9IENvbW1vbi5pbnRBcnJheSh4bGVuK3lsZW4pO1xuXG4gIHZhciBjYXJyeSA9IExvbmcuWkVSTztcbiAgZm9yICh2YXIgaiA9IHlzdGFydCwgayA9IHlzdGFydCArIDEgKyB4c3RhcnQ7IGogPj0gMDsgai0tLCBrLS0pIHtcbiAgICB2YXIgcHJvZHVjdCA9IExvbmcuZnJvbU51bWJlcih5W2pdID4+PiAzMikubXVsdGlwbHkoTG9uZy5mcm9tTnVtYmVyKHhbeHN0YXJ0XSA+Pj4gMzIpKS5hZGQoY2FycnkpO1xuICAgIHpba10gPSBwcm9kdWN0LmxvdztcbiAgICBjYXJyeSA9IHByb2R1Y3Quc2hpZnRSaWdodFVuc2lnbmVkKDMyKTtcbiAgfVxuICB6W3hzdGFydF0gPSBjYXJyeS5sb3c7XG5cbiAgZm9yICh2YXIgaSA9IHhzdGFydC0xOyBpID49IDA7IGktLSkge1xuICAgIGNhcnJ5ID0gTG9uZy5aRVJPO1xuICAgIGZvciAodmFyIGogPSB5c3RhcnQsIGsgPSB5c3RhcnQgKyAxICsgaTsgaiA+PSAwOyBqLS0sIGstLSkge1xuICAgICAgICB2YXIgcHJvZHVjdCA9IExvbmcuZnJvbU51bWJlcih5W2pdID4+PiAzMikubXVsdGlwbHkoTG9uZy5mcm9tTnVtYmVyKHhbaV0gPj4+IDMyKSkuYWRkKExvbmcuZnJvbU51bWJlcih6W2tdID4+PiAzMikpLmFkZChjYXJyeSk7XG4gICAgICAgIHpba10gPSBwcm9kdWN0LmxvdztcbiAgICAgICAgY2FycnkgPSBwcm9kdWN0LnNoaWZ0UmlnaHRVbnNpZ25lZCgzMik7XG4gICAgfVxuICAgIHpbaV0gPSBjYXJyeS5sb3c7XG4gIH1cbiAgcmV0dXJuIHo7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMge0Bjb2RlICh0aGlzICogdmFsKX0uXG4gKlxuICogQHBhcmFtICB2YWwgdmFsdWUgdG8gYmUgbXVsdGlwbGllZCBieSB0aGlzIEJpZ0ludGVnZXIuXG4gKiBAcmV0dXJuIHtAY29kZSB0aGlzICogdmFsfVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgaWYgKHZhbC5zaWdudW0gPT0gMCB8fCB0aGlzLnNpZ251bSA9PSAwKVxuICAgIHJldHVybiBaRVJPO1xuICB2YXIgcmVzdWx0ID0gbXVsdGlwbHlUb0xlbih0aGlzLm1hZywgdGhpcy5tYWcubGVuZ3RoLCB2YWwubWFnLCB2YWwubWFnLmxlbmd0aCwgbnVsbCk7XG4gIHJlc3VsdCA9IHRydXN0ZWRTdHJpcExlYWRpbmdaZXJvSW50cyhyZXN1bHQpO1xuICB2YXIgeCA9IEJpZ0ludGVnZXIuZnJvbU1hZyhyZXN1bHQsIHRoaXMuc2lnbnVtID09IHZhbC5zaWdudW0gPyAxIDogLTEpO1xuICByZXR1cm4geDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIHR3bydzIGNvbXBsZW1lbnQgcmVwcmVzZW50YXRpb24gaW4gaW50cyxcbiAqIGluY2x1ZGluZyBzcGFjZSBmb3IgYXQgbGVhc3Qgb25lIHNpZ24gYml0LlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5pbnRMZW5ndGggPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiAodGhpcy5iaXRMZW5ndGgoKSA+Pj4gNSkgKyAxO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdpdGggdGhlIGdpdmVuIHR3bydzIGNvbXBsZW1lbnQgcmVwcmVzZW50YXRpb24uXG4gKiBBc3N1bWVzIHRoYXQgdGhlIGlucHV0IGFycmF5IHdpbGwgbm90IGJlIG1vZGlmaWVkICh0aGUgcmV0dXJuZWRcbiAqIEJpZ0ludGVnZXIgd2lsbCByZWZlcmVuY2UgdGhlIGlucHV0IGFycmF5IGlmIGZlYXNpYmxlKS5cbiAqL1xuZnVuY3Rpb24gdmFsdWVPZih2YWwpIHtcbiAgcmV0dXJuICh2YWxbMF0gPiAwID8gQmlnSW50ZWdlci5mcm9tTWFnKHZhbCwgMSkgOiBCaWdJbnRlZ2VyLmZyb21NYWcodmFsKSk7XG59XG5cbi8vIGxvbmcgdmFsXG5CaWdJbnRlZ2VyLnZhbHVlT2YgPSBmdW5jdGlvbiAodmFsKSB7XG4gIC8vIElmIC1NQVhfQ09OU1RBTlQgPCB2YWwgPCBNQVhfQ09OU1RBTlQsIHJldHVybiBzdGFzaGVkIGNvbnN0YW50XG4gIGlmICh2YWwudG9OdW1iZXIoKSA9PT0gMClcbiAgICByZXR1cm4gWkVSTztcbiAgaWYgKHZhbC50b051bWJlcigpID4gMCAmJiB2YWwudG9OdW1iZXIoKSA8PSBNQVhfQ09OU1RBTlQpXG4gICAgICByZXR1cm4gcG9zQ29uc3RbdmFsLmxvd107XG4gIGVsc2UgaWYgKHZhbC50b051bWJlcigpIDwgMCAmJiB2YWwudG9OdW1iZXIoKSA+PSAtTUFYX0NPTlNUQU5UKVxuICAgICAgcmV0dXJuIG5lZ0NvbnN0W3ZhbC5uZWdhdGUoKS5sb3ddO1xuXG4gIHJldHVybiBCaWdJbnRlZ2VyLmZyb21Mb25nKHZhbCk7XG59XG5cbi8qKlxuICogVGFrZXMgYW4gYXJyYXkgYSByZXByZXNlbnRpbmcgYSBuZWdhdGl2ZSAyJ3MtY29tcGxlbWVudCBudW1iZXIgYW5kXG4gKiByZXR1cm5zIHRoZSBtaW5pbWFsIChubyBsZWFkaW5nIHplcm8gaW50cykgdW5zaWduZWQgd2hvc2UgdmFsdWUgaXMgLWEuXG4gKiBAcGFyYW0ge2ludFtdfSBhXG4gKi9cbmZ1bmN0aW9uIG1ha2VQb3NpdGl2ZShhKSB7XG4gICAgdmFyIGtlZXAsIGo7XG5cbiAgICAvLyBGaW5kIGZpcnN0IG5vbi1zaWduICgweGZmZmZmZmZmKSBpbnQgb2YgaW5wdXRcbiAgICBmb3IgKGtlZXAgPSAwOyBrZWVwIDwgYS5sZW5ndGggJiYgYVtrZWVwXSA9PT0gLTE7IGtlZXArKylcbiAgICAgICAgO1xuXG4gICAgLyogQWxsb2NhdGUgb3V0cHV0IGFycmF5LiAgSWYgYWxsIG5vbi1zaWduIGludHMgYXJlIDB4MDAsIHdlIG11c3RcbiAgICAgKiBhbGxvY2F0ZSBzcGFjZSBmb3Igb25lIGV4dHJhIG91dHB1dCBpbnQuICovXG4gICAgZm9yIChqID0ga2VlcDsgaiA8IGEubGVuZ3RoICYmIGFbal0gPT09IDA7IGorKylcbiAgICAgICAgO1xuICAgIHZhciBleHRyYUludCA9IChqID09PSBhLmxlbmd0aCA/IDEgOiAwKTtcbiAgICB2YXIgcmVzdWx0ID0gQ29tbW9uLmludEFycmF5KGEubGVuZ3RoIC0ga2VlcCArIGV4dHJhSW50KTtcblxuICAgIC8qIENvcHkgb25lJ3MgY29tcGxlbWVudCBvZiBpbnB1dCBpbnRvIG91dHB1dCwgbGVhdmluZyBleHRyYVxuICAgICAqIGludCAoaWYgaXQgZXhpc3RzKSA9PSAweDAwICovXG4gICAgZm9yICh2YXIgaSA9IGtlZXA7IGkgPCBhLmxlbmd0aDsgaSsrKVxuICAgICAgICByZXN1bHRbaSAtIGtlZXAgKyBleHRyYUludF0gPSB+YVtpXTtcblxuICAgIC8vIEFkZCBvbmUgdG8gb25lJ3MgY29tcGxlbWVudCB0byBnZW5lcmF0ZSB0d28ncyBjb21wbGVtZW50XG4gICAgZm9yICh2YXIgaSA9IHJlc3VsdC5sZW5ndGggLSAxOyArK3Jlc3VsdFtpXSA9PT0gMDsgaS0tKVxuICAgICAgICA7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyAmIHZhbCl9LiAgKFRoaXNcbiAqIG1ldGhvZCByZXR1cm5zIGEgbmVnYXRpdmUgQmlnSW50ZWdlciBpZiBhbmQgb25seSBpZiB0aGlzIGFuZCB2YWwgYXJlXG4gKiBib3RoIG5lZ2F0aXZlLilcbiAqXG4gKiBAcGFyYW0gdmFsIHZhbHVlIHRvIGJlIEFORCdlZCB3aXRoIHRoaXMgQmlnSW50ZWdlci5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgJiB2YWx9XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLmFuZCA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgdmFyIHJlc3VsdCA9IENvbW1vbi5pbnRBcnJheShNYXRoLm1heCh0aGlzLmludExlbmd0aCgpLCB2YWwuaW50TGVuZ3RoKCkpKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXN1bHQubGVuZ3RoOyBpKyspXG4gICAgcmVzdWx0W2ldID0gKHRoaXMuX2dldEludChyZXN1bHQubGVuZ3RoLWktMSkgJiB2YWwuX2dldEludChyZXN1bHQubGVuZ3RoLWktMSkpO1xuICByZXR1cm4gdmFsdWVPZihyZXN1bHQpO1xufVxuXG4vKipcbiogU3F1YXJlcyB0aGUgY29udGVudHMgb2YgdGhlIGludCBhcnJheSB4LiBUaGUgcmVzdWx0IGlzIHBsYWNlZCBpbnRvIHRoZVxuKiBpbnQgYXJyYXkgei4gIFRoZSBjb250ZW50cyBvZiB4IGFyZSBub3QgY2hhbmdlZC5cbiovXG52YXIgc3F1YXJlVG9MZW4gPSBCaWdJbnRlZ2VyLnNxdWFyZVRvTGVuID0gZnVuY3Rpb24gKHgsIGxlbiwgeikge1xuICAvKlxuICAgKiBUaGUgYWxnb3JpdGhtIHVzZWQgaGVyZSBpcyBhZGFwdGVkIGZyb20gQ29saW4gUGx1bWIncyBDIGxpYnJhcnkuXG4gICAqIFRlY2huaXF1ZTogQ29uc2lkZXIgdGhlIHBhcnRpYWwgcHJvZHVjdHMgaW4gdGhlIG11bHRpcGxpY2F0aW9uXG4gICAqIG9mIFwiYWJjZGVcIiBieSBpdHNlbGY6XG4gICAqXG4gICAqICAgICAgICAgICAgICAgYSAgYiAgYyAgZCAgZVxuICAgKiAgICAgICAgICAgICogIGEgIGIgIGMgIGQgIGVcbiAgICogICAgICAgICAgPT09PT09PT09PT09PT09PT09XG4gICAqICAgICAgICAgICAgICBhZSBiZSBjZSBkZSBlZVxuICAgKiAgICAgICAgICAgYWQgYmQgY2QgZGQgZGVcbiAgICogICAgICAgIGFjIGJjIGNjIGNkIGNlXG4gICAqICAgICBhYiBiYiBiYyBiZCBiZVxuICAgKiAgYWEgYWIgYWMgYWQgYWVcbiAgICpcbiAgICogTm90ZSB0aGF0IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIG1haW4gZGlhZ29uYWw6XG4gICAqICAgICAgICAgICAgICBhZSBiZSBjZSBkZSA9IChhYmNkKSAqIGVcbiAgICogICAgICAgICAgIGFkIGJkIGNkICAgICAgID0gKGFiYykgKiBkXG4gICAqICAgICAgICBhYyBiYyAgICAgICAgICAgICA9IChhYikgKiBjXG4gICAqICAgICBhYiAgICAgICAgICAgICAgICAgICA9IChhKSAqIGJcbiAgICpcbiAgICogaXMgYSBjb3B5IG9mIGV2ZXJ5dGhpbmcgYmVsb3cgdGhlIG1haW4gZGlhZ29uYWw6XG4gICAqICAgICAgICAgICAgICAgICAgICAgICBkZVxuICAgKiAgICAgICAgICAgICAgICAgY2QgY2VcbiAgICogICAgICAgICAgIGJjIGJkIGJlXG4gICAqICAgICBhYiBhYyBhZCBhZVxuICAgKlxuICAgKiBUaHVzLCB0aGUgc3VtIGlzIDIgKiAob2ZmIHRoZSBkaWFnb25hbCkgKyBkaWFnb25hbC5cbiAgICpcbiAgICogVGhpcyBpcyBhY2N1bXVsYXRlZCBiZWdpbm5pbmcgd2l0aCB0aGUgZGlhZ29uYWwgKHdoaWNoXG4gICAqIGNvbnNpc3Qgb2YgdGhlIHNxdWFyZXMgb2YgdGhlIGRpZ2l0cyBvZiB0aGUgaW5wdXQpLCB3aGljaCBpcyB0aGVuXG4gICAqIGRpdmlkZWQgYnkgdHdvLCB0aGUgb2ZmLWRpYWdvbmFsIGFkZGVkLCBhbmQgbXVsdGlwbGllZCBieSB0d29cbiAgICogYWdhaW4uICBUaGUgbG93IGJpdCBpcyBzaW1wbHkgYSBjb3B5IG9mIHRoZSBsb3cgYml0IG9mIHRoZVxuICAgKiBpbnB1dCwgc28gaXQgZG9lc24ndCBuZWVkIHNwZWNpYWwgY2FyZS5cbiAgICovXG4gIHZhciB6bGVuID0gbGVuIDw8IDE7XG4gIGlmICh6ID09IG51bGwgfHwgei5sZW5ndGggPCB6bGVuKVxuICAgIHogPSBDb21tb24uaW50QXJyYXkoemxlbik7XG5cbiAgLy8gU3RvcmUgdGhlIHNxdWFyZXMsIHJpZ2h0IHNoaWZ0ZWQgb25lIGJpdCAoaS5lLiwgZGl2aWRlZCBieSAyKVxuICB2YXIgbGFzdFByb2R1Y3RMb3dXb3JkID0gMDtcbiAgZm9yICh2YXIgaj0wLCBpPTA7IGo8bGVuOyBqKyspIHtcbiAgICB2YXIgcGllY2UgPSBMb25nLmZyb21OdW1iZXIoeFtqXSA+Pj4gMzIpO1xuICAgIHZhciBwcm9kdWN0ID0gcGllY2UubXVsdGlwbHkocGllY2UpO1xuICAgIHpbaSsrXSA9IChsYXN0UHJvZHVjdExvd1dvcmQgPDwgMzEpIHwgcHJvZHVjdC5zaGlmdFJpZ2h0VW5zaWduZWQoMzMpLmxvdztcbiAgICB6W2krK10gPSBwcm9kdWN0LnNoaWZ0UmlnaHRVbnNpZ25lZCgxKS5sb3c7XG4gICAgbGFzdFByb2R1Y3RMb3dXb3JkID0gcHJvZHVjdC5sb3c7XG4gIH1cblxuICAvLyBBZGQgaW4gb2ZmLWRpYWdvbmFsIHN1bXNcbiAgZm9yICh2YXIgaSA9IGxlbiwgb2Zmc2V0ID0gMTsgaSA+IDA7IGktLSwgb2Zmc2V0ICs9IDIpIHtcbiAgICB2YXIgdCA9IHhbaS0xXTtcbiAgICB0ID0gbXVsQWRkKHosIHgsIG9mZnNldCwgaS0xLCB0KTtcbiAgICBhZGRPbmUoeiwgb2Zmc2V0LTEsIGksIHQpO1xuICB9XG5cbiAgLy8gU2hpZnQgYmFjayB1cCBhbmQgc2V0IGxvdyBiaXRcbiAgcHJpbWl0aXZlTGVmdFNoaWZ0KHosIHpsZW4sIDEpO1xuICB6W3psZW4tMV0gfD0geFtsZW4tMV0gJiAxO1xuXG4gIHJldHVybiB6O1xufVxuXG4vKipcbiAqIE11bHRpcGx5IGFuIGFycmF5IGJ5IG9uZSB3b3JkIGsgYW5kIGFkZCB0byByZXN1bHQsIHJldHVybiB0aGUgY2FycnlcbiAqIGludFtdIG91dCwgaW50W10gaW4sIGludCBvZmZzZXQsIGludCBsZW4sIGludCBrXG4gKi9cbmZ1bmN0aW9uIG11bEFkZChvdXQsIF9pbiwgb2Zmc2V0LCBsZW4sIGspIHtcbiAgdmFyIGtMb25nID0gTG9uZy5mcm9tTnVtYmVyKGsgPj4+IDMyKTtcbiAgdmFyIGNhcnJ5ID0gTG9uZy5mcm9tTnVtYmVyKDApO1xuXG4gIG9mZnNldCA9IG91dC5sZW5ndGggLSBvZmZzZXQgLSAxO1xuICBmb3IgKHZhciBqID0gbGVuIC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICB2YXIgcHJvZHVjdCA9IExvbmcuZnJvbU51bWJlcihfaW5bal0gPj4+IDMyKS5tdWx0aXBseShrTG9uZykuYWRkKExvbmcuZnJvbU51bWJlcihvdXRbb2Zmc2V0XSA+Pj4gMzIpKS5hZGQoY2FycnkpO1xuICAgIG91dFtvZmZzZXQtLV0gPSBwcm9kdWN0LmxvdztcbiAgICBjYXJyeSA9IHByb2R1Y3Quc2hpZnRSaWdodFVuc2lnbmVkKDMyKTtcbiAgfVxuICByZXR1cm4gY2FycnkubG93O1xufVxuXG4vKipcbiAqIEFkZCBvbmUgd29yZCB0byB0aGUgbnVtYmVyIGEgbWxlbiB3b3JkcyBpbnRvIGEuIFJldHVybiB0aGUgcmVzdWx0aW5nXG4gKiBjYXJyeS5cbiAqIGludFtdIGEsIGludCBvZmZzZXQsIGludCBtbGVuLCBpbnQgY2FycnlcbiAqL1xuZnVuY3Rpb24gYWRkT25lKGEsIG9mZnNldCwgbWxlbiwgY2FycnkpIHtcbiAgb2Zmc2V0ID0gYS5sZW5ndGggLSAxIC0gbWxlbiAtIG9mZnNldDtcbiAgdmFyIHQgPSBMb25nLmZyb21OdW1iZXIoYVtvZmZzZXRdID4+PiAzMikuYWRkKExvbmcuZnJvbU51bWJlcihjYXJyeSA+Pj4gMzIpKTtcblxuICBhW29mZnNldF0gPSB0LmxvdztcbiAgaWYgKHQuc2hpZnRSaWdodFVuc2lnbmVkKDMyKS50b051bWJlcigpID09PSAwKVxuICAgIHJldHVybiAwO1xuICB3aGlsZSAoLS1tbGVuID49IDApIHtcbiAgICBpZiAoLS1vZmZzZXQgPCAwKSB7IC8vIENhcnJ5IG91dCBvZiBudW1iZXJcbiAgICAgIHJldHVybiAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBhW29mZnNldF0rKztcbiAgICAgIGlmIChhW29mZnNldF0gIT0gMClcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHJldHVybiAxO1xufVxuXG4vLyBzaGlmdHMgYSB1cCB0byBsZW4gbGVmdCBuIGJpdHMgYXNzdW1lcyBubyBsZWFkaW5nIHplcm9zLCAwPD1uPDMyXG5mdW5jdGlvbiBwcmltaXRpdmVMZWZ0U2hpZnQoYSwgbGVuLCBuKSB7XG4gIGlmIChsZW4gPT09IDAgfHwgbiA9PT0gMClcbiAgICByZXR1cm47XG4gIHZhciBuMiA9IDMyIC0gbjtcbiAgZm9yICh2YXIgaT0wLCBjPWFbaV0sIG09aStsZW4tMTsgaTxtOyBpKyspIHtcbiAgICAgIHZhciBiID0gYztcbiAgICAgIGMgPSBhW2krMV07XG4gICAgICBhW2ldID0gKGIgPDwgbikgfCAoYyA+Pj4gbjIpO1xuICB9XG4gIGFbbGVuLTFdIDw8PSBuO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMgPHR0Pih0aGlzPHN1cD5leHBvbmVudDwvc3VwPik8L3R0Pi5cbiAqIE5vdGUgdGhhdCB7QGNvZGUgZXhwb25lbnR9IGlzIGFuIGludGVnZXIgcmF0aGVyIHRoYW4gYSBCaWdJbnRlZ2VyLlxuICpcbiAqIEBwYXJhbSAgZXhwb25lbnQgZXhwb25lbnQgdG8gd2hpY2ggdGhpcyBCaWdJbnRlZ2VyIGlzIHRvIGJlIHJhaXNlZC5cbiAqIEByZXR1cm4gPHR0PnRoaXM8c3VwPmV4cG9uZW50PC9zdXA+PC90dD5cbiAqIEB0aHJvd3MgQXJpdGhtZXRpY0V4Y2VwdGlvbiB7QGNvZGUgZXhwb25lbnR9IGlzIG5lZ2F0aXZlLiAgKFRoaXMgd291bGRcbiAqICAgICAgICAgY2F1c2UgdGhlIG9wZXJhdGlvbiB0byB5aWVsZCBhIG5vbi1pbnRlZ2VyIHZhbHVlLilcbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUucG93ID0gZnVuY3Rpb24gKGV4cG9uZW50KSB7XG4gIGlmIChleHBvbmVudCA8IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTmVnYXRpdmUgZXhwb25lbnRcIik7XG4gIGlmICh0aGlzLnNpZ251bSA9PT0gMClcbiAgICByZXR1cm4gKGV4cG9uZW50ID09PSAwID8gT05FIDogdGhpcyk7XG5cbiAgLy8gUGVyZm9ybSBleHBvbmVudGlhdGlvbiB1c2luZyByZXBlYXRlZCBzcXVhcmluZyB0cmlja1xuICB2YXIgbmV3U2lnbiA9ICh0aGlzLnNpZ251bSA8IDAgJiYgKGV4cG9uZW50ICYgMSkgPT09IDEgPyAtMSA6IDEpO1xuICB2YXIgYmFzZVRvUG93MiA9IHRoaXMubWFnO1xuICB2YXIgcmVzdWx0ID0gWzFdO1xuXG4gIHdoaWxlIChleHBvbmVudCAhPSAwKSB7XG4gICAgaWYgKChleHBvbmVudCAmIDEpPT0xKSB7XG4gICAgICByZXN1bHQgPSBtdWx0aXBseVRvTGVuKHJlc3VsdCwgcmVzdWx0Lmxlbmd0aCwgYmFzZVRvUG93MiwgYmFzZVRvUG93Mi5sZW5ndGgsIG51bGwpO1xuICAgICAgcmVzdWx0ID0gdHJ1c3RlZFN0cmlwTGVhZGluZ1plcm9JbnRzKHJlc3VsdCk7XG4gICAgfVxuICAgIGlmICgoZXhwb25lbnQgPj4+PSAxKSAhPSAwKSB7XG4gICAgICBiYXNlVG9Qb3cyID0gc3F1YXJlVG9MZW4oYmFzZVRvUG93MiwgYmFzZVRvUG93Mi5sZW5ndGgsIG51bGwpO1xuICAgICAgYmFzZVRvUG93MiA9IHRydXN0ZWRTdHJpcExlYWRpbmdaZXJvSW50cyhiYXNlVG9Qb3cyKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyhyZXN1bHQsIG5ld1NpZ24pO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyB8IHZhbCl9LiAgKFRoaXMgbWV0aG9kXG4gKiByZXR1cm5zIGEgbmVnYXRpdmUgQmlnSW50ZWdlciBpZiBhbmQgb25seSBpZiBlaXRoZXIgdGhpcyBvciB2YWwgaXNcbiAqIG5lZ2F0aXZlLilcbiAqXG4gKiBAcGFyYW0gdmFsIHZhbHVlIHRvIGJlIE9SJ2VkIHdpdGggdGhpcyBCaWdJbnRlZ2VyLlxuICogQHJldHVybiB7QGNvZGUgdGhpcyB8IHZhbH1cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUub3IgPSBmdW5jdGlvbiAodmFsKSB7XG4gIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkoTWF0aC5tYXgodGhpcy5pbnRMZW5ndGgoKSwgdmFsLmludExlbmd0aCgpKSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdWx0Lmxlbmd0aDsgaSsrKVxuICAgIHJlc3VsdFtpXSA9ICh0aGlzLl9nZXRJbnQocmVzdWx0Lmxlbmd0aC1pLTEpIHwgdmFsLl9nZXRJbnQocmVzdWx0Lmxlbmd0aC1pLTEpKTtcblxuICByZXR1cm4gdmFsdWVPZihyZXN1bHQpO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMge0Bjb2RlICh0aGlzIF4gdmFsKX0uICAoVGhpcyBtZXRob2RcbiAqIHJldHVybnMgYSBuZWdhdGl2ZSBCaWdJbnRlZ2VyIGlmIGFuZCBvbmx5IGlmIGV4YWN0bHkgb25lIG9mIHRoaXMgYW5kXG4gKiB2YWwgYXJlIG5lZ2F0aXZlLilcbiAqXG4gKiBAcGFyYW0gdmFsIHZhbHVlIHRvIGJlIFhPUidlZCB3aXRoIHRoaXMgQmlnSW50ZWdlci5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgXiB2YWx9XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLnhvciA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgICB2YXIgcmVzdWx0ID0gQ29tbW9uLmludEFycmF5KE1hdGgubWF4KHRoaXMuaW50TGVuZ3RoKCksIHZhbC5pbnRMZW5ndGgoKSkpO1xuICAgIGZvciAodmFyIGk9MDsgaTxyZXN1bHQubGVuZ3RoOyBpKyspXG4gICAgICByZXN1bHRbaV0gPSAodGhpcy5fZ2V0SW50KHJlc3VsdC5sZW5ndGgtaS0xKSBeIHZhbC5fZ2V0SW50KHJlc3VsdC5sZW5ndGgtaS0xKSk7XG5cbiAgICByZXR1cm4gdmFsdWVPZihyZXN1bHQpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyAmIH52YWwpfS4gIFRoaXNcbiAqIG1ldGhvZCwgd2hpY2ggaXMgZXF1aXZhbGVudCB0byB7QGNvZGUgYW5kKHZhbC5ub3QoKSl9LCBpcyBwcm92aWRlZCBhc1xuICogYSBjb252ZW5pZW5jZSBmb3IgbWFza2luZyBvcGVyYXRpb25zLiAgKFRoaXMgbWV0aG9kIHJldHVybnMgYSBuZWdhdGl2ZVxuICogQmlnSW50ZWdlciBpZiBhbmQgb25seSBpZiB7QGNvZGUgdGhpc30gaXMgbmVnYXRpdmUgYW5kIHtAY29kZSB2YWx9IGlzXG4gKiBwb3NpdGl2ZS4pXG4gKlxuICogQHBhcmFtIHZhbCB2YWx1ZSB0byBiZSBjb21wbGVtZW50ZWQgYW5kIEFORCdlZCB3aXRoIHRoaXMgQmlnSW50ZWdlci5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgJiB+dmFsfVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5hbmROb3QgPSBmdW5jdGlvbiAodmFsKSB7XG4gIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkoTWF0aC5tYXgodGhpcy5pbnRMZW5ndGgoKSwgdmFsLmludExlbmd0aCgpKSk7XG4gIGZvciAodmFyIGk9MDsgaTxyZXN1bHQubGVuZ3RoOyBpKyspXG4gICAgcmVzdWx0W2ldID0gKHRoaXMuX2dldEludChyZXN1bHQubGVuZ3RoLWktMSkgJiB+dmFsLl9nZXRJbnQocmVzdWx0Lmxlbmd0aC1pLTEpKTtcblxuICByZXR1cm4gdmFsdWVPZihyZXN1bHQpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAofnRoaXMpfS4gIChUaGlzIG1ldGhvZFxuICogcmV0dXJucyBhIG5lZ2F0aXZlIHZhbHVlIGlmIGFuZCBvbmx5IGlmIHRoaXMgQmlnSW50ZWdlciBpc1xuICogbm9uLW5lZ2F0aXZlLilcbiAqXG4gKiBAcmV0dXJuIHtAY29kZSB+dGhpc31cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUubm90ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgcmVzdWx0ID0gQ29tbW9uLmludEFycmF5KHRoaXMuaW50TGVuZ3RoKCkpO1xuICBmb3IgKHZhciBpPTA7IGk8cmVzdWx0Lmxlbmd0aDsgaSsrKVxuICAgIHJlc3VsdFtpXSA9IH50aGlzLl9nZXRJbnQocmVzdWx0Lmxlbmd0aC1pLTEpO1xuXG4gIHJldHVybiB2YWx1ZU9mKHJlc3VsdCk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGJpdHMgaW4gdGhlIHR3bydzIGNvbXBsZW1lbnQgcmVwcmVzZW50YXRpb25cbiAqIG9mIHRoaXMgQmlnSW50ZWdlciB0aGF0IGRpZmZlciBmcm9tIGl0cyBzaWduIGJpdC4gIFRoaXMgbWV0aG9kIGlzXG4gKiB1c2VmdWwgd2hlbiBpbXBsZW1lbnRpbmcgYml0LXZlY3RvciBzdHlsZSBzZXRzIGF0b3AgQmlnSW50ZWdlcnMuXG4gKlxuICogQHJldHVybiBudW1iZXIgb2YgYml0cyBpbiB0aGUgdHdvJ3MgY29tcGxlbWVudCByZXByZXNlbnRhdGlvblxuICogICAgICAgICBvZiB0aGlzIEJpZ0ludGVnZXIgdGhhdCBkaWZmZXIgZnJvbSBpdHMgc2lnbiBiaXQuXG4gKi8gXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5iaXRDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGJjID0gdGhpcy5iaXRDb3VudCAtIDE7XG4gIGlmIChiYyA9PT0gLTEpIHsgIC8vIGJpdENvdW50IG5vdCBpbml0aWFsaXplZCB5ZXRcbiAgICBiYyA9IDA7ICAgICAgLy8gb2Zmc2V0IGJ5IG9uZSB0byBpbml0aWFsaXplXG4gICAgLy8gQ291bnQgdGhlIGJpdHMgaW4gdGhlIG1hZ25pdHVkZVxuICAgIGZvciAodmFyIGkgPSAwOyBpPCB0aGlzLm1hZy5sZW5ndGg7IGkrKylcbiAgICAgIGJjICs9IEludGVnZXIuYml0Q291bnQodGhpcy5tYWdbaV0pO1xuICAgIGlmICh0aGlzLnNpZ251bSA8IDApIHtcbiAgICAgIC8vIENvdW50IHRoZSB0cmFpbGluZyB6ZXJvcyBpbiB0aGUgbWFnbml0dWRlXG4gICAgICB2YXIgbWFnVHJhaWxpbmdaZXJvQ291bnQgPSAwLCBqO1xuICAgICAgZm9yIChqID0gdGhpcy5tYWcubGVuZ3RoLTE7IHRoaXMubWFnW2pdPT0wOyBqLS0pXG4gICAgICAgICAgbWFnVHJhaWxpbmdaZXJvQ291bnQgKz0gMzI7XG4gICAgICBtYWdUcmFpbGluZ1plcm9Db3VudCArPSBJbnRlZ2VyLm51bWJlck9mVHJhaWxpbmdaZXJvcyh0aGlzLm1hZ1tqXSk7XG4gICAgICBiYyArPSBtYWdUcmFpbGluZ1plcm9Db3VudCAtIDE7XG4gICAgfVxuICAgIHRoaXMuYml0Q291bnQgPSBiYyArIDE7XG4gIH1cbiAgcmV0dXJuIGJjO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIGVxdWl2YWxlbnQgdG8gdGhpcyBCaWdJbnRlZ2VyXG4gKiB3aXRoIHRoZSBkZXNpZ25hdGVkIGJpdCBjbGVhcmVkLlxuICogKENvbXB1dGVzIHtAY29kZSAodGhpcyAmIH4oMTw8bikpfS4pXG4gKlxuICogQHBhcmFtICBuIGluZGV4IG9mIGJpdCB0byBjbGVhci5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgJiB+KDE8PG4pfVxuICogQHRocm93cyBBcml0aG1ldGljRXhjZXB0aW9uIHtAY29kZSBufSBpcyBuZWdhdGl2ZS5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuY2xlYXJCaXQgPSBmdW5jdGlvbiAobikge1xuICBpZiAobjwwKVxuICAgIHRocm93IG5ldyBFcnJvcihcIk5lZ2F0aXZlIGJpdCBhZGRyZXNzXCIpO1xuXG4gIHZhciBpbnROdW0gPSBuID4+PiA1O1xuICB2YXIgcmVzdWx0ID0gQ29tbW9uLmludEFycmF5KE1hdGgubWF4KHRoaXMuaW50TGVuZ3RoKCksICgobiArIDEpID4+PiA1KSArIDEpKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKylcbiAgICByZXN1bHRbcmVzdWx0Lmxlbmd0aC1pLTFdID0gdGhpcy5fZ2V0SW50KGkpO1xuXG4gIHJlc3VsdFtyZXN1bHQubGVuZ3RoLWludE51bS0xXSAmPSB+KDEgPDwgKG4gJiAzMSkpO1xuXG4gIHJldHVybiB2YWx1ZU9mKHJlc3VsdCk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMge0Bjb2RlICh0aGlzIDw8IG4pfS5cbiAqIFRoZSBzaGlmdCBkaXN0YW5jZSwge0Bjb2RlIG59LCBtYXkgYmUgbmVnYXRpdmUsIGluIHdoaWNoIGNhc2VcbiAqIHRoaXMgbWV0aG9kIHBlcmZvcm1zIGEgcmlnaHQgc2hpZnQuXG4gKiAoQ29tcHV0ZXMgPHR0PmZsb29yKHRoaXMgKiAyPHN1cD5uPC9zdXA+KTwvdHQ+LilcbiAqXG4gKiBAcGFyYW0gIG4gc2hpZnQgZGlzdGFuY2UsIGluIGJpdHMuXG4gKiBAcmV0dXJuIHtAY29kZSB0aGlzIDw8IG59XG4gKiBAdGhyb3dzIEFyaXRobWV0aWNFeGNlcHRpb24gaWYgdGhlIHNoaWZ0IGRpc3RhbmNlIGlzIHtAY29kZVxuICogICAgICAgICBJbnRlZ2VyLk1JTl9WQUxVRX0uXG4gKiBAc2VlICNzaGlmdFJpZ2h0XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLnNoaWZ0TGVmdCA9IGZ1bmN0aW9uIChuKSB7XG4gIGlmICh0aGlzLnNpZ251bSA9PSAwKVxuICAgIHJldHVybiBaRVJPO1xuICBpZiAobj09MClcbiAgICByZXR1cm4gdGhpcztcbiAgaWYgKG48MCkge1xuICAgIGlmIChuID09IEludGVnZXIuTUlOX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNoaWZ0IGRpc3RhbmNlIG9mIEludGVnZXIuTUlOX1ZBTFVFIG5vdCBzdXBwb3J0ZWQuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNoaWZ0UmlnaHQoLW4pO1xuICAgIH1cbiAgfVxuXG4gIHZhciBuSW50cyA9IG4gPj4+IDU7XG4gIHZhciBuQml0cyA9IG4gJiAweDFmO1xuICB2YXIgbWFnTGVuID0gdGhpcy5tYWcubGVuZ3RoO1xuICB2YXIgbmV3TWFnID0gbnVsbDtcblxuICBpZiAobkJpdHMgPT0gMCkge1xuICAgIG5ld01hZyA9IENvbW1vbi5pbnRBcnJheShtYWdMZW4gKyBuSW50cyk7XG4gICAgZm9yICh2YXIgaT0wOyBpPG1hZ0xlbjsgaSsrKVxuICAgICAgbmV3TWFnW2ldID0gdGhpcy5tYWdbaV07XG4gIH0gZWxzZSB7XG4gICAgICB2YXIgaSA9IDA7XG4gICAgICB2YXIgbkJpdHMyID0gMzIgLSBuQml0cztcbiAgICAgIHZhciBoaWdoQml0cyA9IHRoaXMubWFnWzBdID4+PiBuQml0czI7XG4gICAgICBpZiAoaGlnaEJpdHMgIT0gMCkge1xuICAgICAgICAgIG5ld01hZyA9IENvbW1vbi5pbnRBcnJheShtYWdMZW4gKyBuSW50cyArIDEpO1xuICAgICAgICAgIG5ld01hZ1tpKytdID0gaGlnaEJpdHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5ld01hZyA9IENvbW1vbi5pbnRBcnJheShtYWdMZW4gKyBuSW50cyk7XG4gICAgICB9XG4gICAgICB2YXIgaj0wO1xuICAgICAgd2hpbGUgKGogPCBtYWdMZW4tMSlcbiAgICAgICAgICBuZXdNYWdbaSsrXSA9IHRoaXMubWFnW2orK10gPDwgbkJpdHMgfCB0aGlzLm1hZ1tqXSA+Pj4gbkJpdHMyO1xuICAgICAgbmV3TWFnW2ldID0gdGhpcy5tYWdbal0gPDwgbkJpdHM7XG4gIH1cblxuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTWFnKG5ld01hZywgdGhpcy5zaWdudW0pO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyA+PiBuKX0uICBTaWduXG4gKiBleHRlbnNpb24gaXMgcGVyZm9ybWVkLiAgVGhlIHNoaWZ0IGRpc3RhbmNlLCB7QGNvZGUgbn0sIG1heSBiZVxuICogbmVnYXRpdmUsIGluIHdoaWNoIGNhc2UgdGhpcyBtZXRob2QgcGVyZm9ybXMgYSBsZWZ0IHNoaWZ0LlxuICogKENvbXB1dGVzIDx0dD5mbG9vcih0aGlzIC8gMjxzdXA+bjwvc3VwPik8L3R0Pi4pXG4gKlxuICogQHBhcmFtICBuIHNoaWZ0IGRpc3RhbmNlLCBpbiBiaXRzLlxuICogQHJldHVybiB7QGNvZGUgdGhpcyA+PiBufVxuICogQHRocm93cyBBcml0aG1ldGljRXhjZXB0aW9uIGlmIHRoZSBzaGlmdCBkaXN0YW5jZSBpcyB7QGNvZGVcbiAqICAgICAgICAgSW50ZWdlci5NSU5fVkFMVUV9LlxuICogQHNlZSAjc2hpZnRMZWZ0XG4gKi9cbkJpZ0ludGVnZXIucHJvdG90eXBlLnNoaWZ0UmlnaHQgPSBmdW5jdGlvbiAobikge1xuICAgIGlmIChuPT0wKVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgaWYgKG48MCkge1xuICAgICAgaWYgKG4gPT0gSW50ZWdlci5NSU5fVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTaGlmdCBkaXN0YW5jZSBvZiBJbnRlZ2VyLk1JTl9WQUxVRSBub3Qgc3VwcG9ydGVkLlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2hpZnRMZWZ0KC1uKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbkludHMgPSBuID4+PiA1O1xuICAgIHZhciBuQml0cyA9IG4gJiAweDFmO1xuICAgIHZhciBtYWdMZW4gPSB0aGlzLm1hZy5sZW5ndGg7XG4gICAgdmFyIG5ld01hZyA9IG51bGw7XG5cbiAgICAvLyBTcGVjaWFsIGNhc2U6IGVudGlyZSBjb250ZW50cyBzaGlmdGVkIG9mZiB0aGUgZW5kXG4gICAgaWYgKG5JbnRzID49IG1hZ0xlbilcbiAgICAgICAgcmV0dXJuICh0aGlzLnNpZ251bSA+PSAwID8gWkVSTyA6IG5lZ0NvbnN0WzFdKTtcblxuICAgIGlmIChuQml0cyA9PSAwKSB7XG4gICAgICAgIHZhciBuZXdNYWdMZW4gPSBtYWdMZW4gLSBuSW50cztcbiAgICAgICAgbmV3TWFnID0gQ29tbW9uLmludEFycmF5KG5ld01hZ0xlbik7XG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxuZXdNYWdMZW47IGkrKylcbiAgICAgICAgICAgIG5ld01hZ1tpXSA9IHRoaXMubWFnW2ldO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgdmFyIGhpZ2hCaXRzID0gdGhpcy5tYWdbMF0gPj4+IG5CaXRzO1xuICAgICAgICBpZiAoaGlnaEJpdHMgIT0gMCkge1xuICAgICAgICAgICAgbmV3TWFnID0gQ29tbW9uLmludEFycmF5KG1hZ0xlbiAtIG5JbnRzKTtcbiAgICAgICAgICAgIG5ld01hZ1tpKytdID0gaGlnaEJpdHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXdNYWcgPSBDb21tb24uaW50QXJyYXkobWFnTGVuIC0gbkludHMgLTEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5CaXRzMiA9IDMyIC0gbkJpdHM7XG4gICAgICAgIHZhciBqPTA7XG4gICAgICAgIHdoaWxlIChqIDwgbWFnTGVuIC0gbkludHMgLSAxKVxuICAgICAgICAgICAgbmV3TWFnW2krK10gPSAodGhpcy5tYWdbaisrXSA8PCBuQml0czIpIHwgKHRoaXMubWFnW2pdID4+PiBuQml0cyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2lnbnVtIDwgMCkge1xuICAgICAgICAvLyBGaW5kIG91dCB3aGV0aGVyIGFueSBvbmUtYml0cyB3ZXJlIHNoaWZ0ZWQgb2ZmIHRoZSBlbmQuXG4gICAgICAgIHZhciBvbmVzTG9zdCA9IGZhbHNlO1xuICAgICAgICBmb3IgKHZhciBpPW1hZ0xlbi0xLCBqPW1hZ0xlbi1uSW50czsgaT49aiAmJiAhb25lc0xvc3Q7IGktLSlcbiAgICAgICAgICAgIG9uZXNMb3N0ID0gKHRoaXMubWFnW2ldICE9IDApO1xuICAgICAgICBpZiAoIW9uZXNMb3N0ICYmIG5CaXRzICE9IDApXG4gICAgICAgICAgICBvbmVzTG9zdCA9ICh0aGlzLm1hZ1ttYWdMZW4gLSBuSW50cyAtIDFdIDw8ICgzMiAtIG5CaXRzKSAhPSAwKTtcblxuICAgICAgICBpZiAob25lc0xvc3QpXG4gICAgICAgICAgICBuZXdNYWcgPSBqYXZhSW5jcmVtZW50KG5ld01hZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyhuZXdNYWcsIHRoaXMuc2lnbnVtKTtcbn1cblxuZnVuY3Rpb24gamF2YUluY3JlbWVudCh2YWwpIHtcbiAgdmFyIGxhc3RTdW0gPSAwO1xuICBmb3IgKHZhciBpPXZhbC5sZW5ndGgtMTsgIGkgPj0gMCAmJiBsYXN0U3VtID09IDA7IGktLSlcbiAgICAgIGxhc3RTdW0gPSAodmFsW2ldICs9IDEpO1xuICBpZiAobGFzdFN1bSA9PSAwKSB7XG4gICAgICB2YWwgPSBDb21tb24uaW50QXJyYXkodmFsLmxlbmd0aCsxKTtcbiAgICAgIHZhbFswXSA9IDE7XG4gIH1cbiAgcmV0dXJuIHZhbDtcbn1cblxuLyoqXG4gKiBDb21wYXJlcyB0aGlzIEJpZ0ludGVnZXIgd2l0aCB0aGUgc3BlY2lmaWVkIEJpZ0ludGVnZXIuICBUaGlzXG4gKiBtZXRob2QgaXMgcHJvdmlkZWQgaW4gcHJlZmVyZW5jZSB0byBpbmRpdmlkdWFsIG1ldGhvZHMgZm9yIGVhY2hcbiAqIG9mIHRoZSBzaXggYm9vbGVhbiBjb21wYXJpc29uIG9wZXJhdG9ycyAoe0BsaXRlcmFsIDx9LCA9PSxcbiAqIHtAbGl0ZXJhbCA+fSwge0BsaXRlcmFsID49fSwgIT0sIHtAbGl0ZXJhbCA8PX0pLiAgVGhlIHN1Z2dlc3RlZFxuICogaWRpb20gZm9yIHBlcmZvcm1pbmcgdGhlc2UgY29tcGFyaXNvbnMgaXM6IHtAY29kZVxuICogKHguY29tcGFyZVRvKHkpfSAmbHQ7PGk+b3A8L2k+Jmd0OyB7QGNvZGUgMCl9LCB3aGVyZVxuICogJmx0OzxpPm9wPC9pPiZndDsgaXMgb25lIG9mIHRoZSBzaXggY29tcGFyaXNvbiBvcGVyYXRvcnMuXG4gKlxuICogQHBhcmFtICB2YWwgQmlnSW50ZWdlciB0byB3aGljaCB0aGlzIEJpZ0ludGVnZXIgaXMgdG8gYmUgY29tcGFyZWQuXG4gKiBAcmV0dXJuIC0xLCAwIG9yIDEgYXMgdGhpcyBCaWdJbnRlZ2VyIGlzIG51bWVyaWNhbGx5IGxlc3MgdGhhbiwgZXF1YWxcbiAqICAgICAgICAgdG8sIG9yIGdyZWF0ZXIgdGhhbiB7QGNvZGUgdmFsfS5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuY29tcGFyZVRvID0gZnVuY3Rpb24gKHZhbCkge1xuICBpZiAodGhpcy5zaWdudW0gPT0gdmFsLnNpZ251bSkge1xuICAgIHN3aXRjaCAodGhpcy5zaWdudW0pIHtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gdGhpcy5jb21wYXJlTWFnbml0dWRlKHZhbCk7XG4gICAgY2FzZSAtMTpcbiAgICAgIHJldHVybiB2YWwuY29tcGFyZU1hZ25pdHVkZSh0aGlzKTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzLnNpZ251bSA+IHZhbC5zaWdudW0gPyAxIDogLTE7XG59XG5cbi8qKlxuICogQ29tcGFyZXMgdGhpcyBCaWdJbnRlZ2VyIHdpdGggdGhlIHNwZWNpZmllZCBPYmplY3QgZm9yIGVxdWFsaXR5LlxuICpcbiAqIEBwYXJhbSAgeCBPYmplY3QgdG8gd2hpY2ggdGhpcyBCaWdJbnRlZ2VyIGlzIHRvIGJlIGNvbXBhcmVkLlxuICogQHJldHVybiB7QGNvZGUgdHJ1ZX0gaWYgYW5kIG9ubHkgaWYgdGhlIHNwZWNpZmllZCBPYmplY3QgaXMgYVxuICogICAgICAgICBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIG51bWVyaWNhbGx5IGVxdWFsIHRvIHRoaXMgQmlnSW50ZWdlci5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKHgpIHtcbiAgLy8gVGhpcyB0ZXN0IGlzIGp1c3QgYW4gb3B0aW1pemF0aW9uLCB3aGljaCBtYXkgb3IgbWF5IG5vdCBoZWxwXG4gIC8vIGlmICh4ID09PSB0aGlzKVxuICAvLyAgIHJldHVybiB0cnVlO1xuXG4gIGlmICh4LmNvbnN0cnVjdG9yLm5hbWUgIT09ICdCaWdJbnRlZ2VyJylcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgdmFyIHhJbnQgPSB4O1xuICBpZiAoeEludC5zaWdudW0gIT0gdGhpcy5zaWdudW0pXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgdmFyIG0gPSB0aGlzLm1hZztcbiAgdmFyIGxlbiA9IG0ubGVuZ3RoO1xuICB2YXIgeG0gPSB4SW50Lm1hZztcbiAgaWYgKGxlbiAhPSB4bS5sZW5ndGgpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspe1xuICAgIGlmICh4bVtpXSAhPSBtW2ldKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyAvIHZhbCl9LlxuICAqXG4gICogQHBhcmFtICB2YWwgdmFsdWUgYnkgd2hpY2ggdGhpcyBCaWdJbnRlZ2VyVGVzdCBpcyB0byBiZSBkaXZpZGVkLlxuICAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgLyB2YWx9XG4gICogQHRocm93cyBBcml0aG1ldGljRXhjZXB0aW9uIGlmIHtAY29kZSB2YWx9IGlzIHplcm8uXG4gICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5kaXZpZGUgPSBmdW5jdGlvbiAodmFsKSB7XG4gIHZhciBxID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKCk7XG4gIHZhciBhID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHRoaXMubWFnKTtcbiAgdmFyIGIgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIodmFsLm1hZyk7XG4gIGEuZGl2aWRlKGIsIHEpO1xuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTXV0YWJsZUJpZ0ludGVnZXIocSwgdGhpcy5zaWdudW0gPT09IHZhbC5zaWdudW0gPyAxIDogLTEpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyAlIHZhbCl9LlxuICpcbiAqIEBwYXJhbSAgdmFsIHZhbHVlIGJ5IHdoaWNoIHRoaXMgQmlnSW50ZWdlciBpcyB0byBiZSBkaXZpZGVkLCBhbmQgdGhlXG4gKiAgICAgICAgIHJlbWFpbmRlciBjb21wdXRlZC5cbiAqIEByZXR1cm4ge0Bjb2RlIHRoaXMgJSB2YWx9XG4gKiBAdGhyb3dzIEFyaXRobWV0aWNFeGNlcHRpb24gaWYge0Bjb2RlIHZhbH0gaXMgemVyby5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUucmVtYWluZGVyID0gZnVuY3Rpb24gKHZhbCkge1xuICB2YXIgcSA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcigpO1xuICB2YXIgYSA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcih0aGlzLm1hZyk7XG4gIHZhciBiID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHZhbC5tYWcpO1xuICB2YXIgeCA9IGEuZGl2aWRlKGIsIHEpO1xuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTXV0YWJsZUJpZ0ludGVnZXIoeCwgdGhpcy5zaWdudW0pO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBCaWdJbnRlZ2VyIHdob3NlIHZhbHVlIGlzIHtAY29kZSAodGhpcyBtb2QgbX0pLiAgVGhpcyBtZXRob2RcbiAqIGRpZmZlcnMgZnJvbSB7QGNvZGUgcmVtYWluZGVyfSBpbiB0aGF0IGl0IGFsd2F5cyByZXR1cm5zIGFcbiAqIDxpPm5vbi1uZWdhdGl2ZTwvaT4gQmlnSW50ZWdlci5cbiAqXG4gKiBAcGFyYW0gIG0gdGhlIG1vZHVsdXMuXG4gKiBAcmV0dXJuIHtAY29kZSB0aGlzIG1vZCBtfVxuICogQHRocm93cyBBcml0aG1ldGljRXhjZXB0aW9uIHtAY29kZSBtfSAmbGU7IDBcbiAqIEBzZWUgICAgI3JlbWFpbmRlclxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5tb2QgPSBmdW5jdGlvbiAobSkge1xuICBpZiAobS5zaWdudW0gPD0gMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJCaWdJbnRlZ2VyOiBtb2R1bHVzIG5vdCBwb3NpdGl2ZVwiKTtcblxuICB2YXIgcmVzdWx0ID0gdGhpcy5yZW1haW5kZXIobSk7XG4gIHJldHVybiAocmVzdWx0LnNpZ251bSA+PSAwID8gcmVzdWx0IDogcmVzdWx0LmFkZChtKSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB7QGNvZGUgdHJ1ZX0gaWYgYW5kIG9ubHkgaWYgdGhlIGRlc2lnbmF0ZWQgYml0IGlzIHNldC5cbiAqIChDb21wdXRlcyB7QGNvZGUgKCh0aGlzICYgKDE8PG4pKSAhPSAwKX0uKVxuICpcbiAqIEBwYXJhbSAgbiBpbmRleCBvZiBiaXQgdG8gdGVzdC5cbiAqIEByZXR1cm4ge0Bjb2RlIHRydWV9IGlmIGFuZCBvbmx5IGlmIHRoZSBkZXNpZ25hdGVkIGJpdCBpcyBzZXQuXG4gKiBAdGhyb3dzIEFyaXRobWV0aWNFeGNlcHRpb24ge0Bjb2RlIG59IGlzIG5lZ2F0aXZlLlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS50ZXN0Qml0ID0gZnVuY3Rpb24gKG4pIHtcbiAgaWYgKG48MClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJOZWdhdGl2ZSBiaXQgYWRkcmVzc1wiKTtcbiAgcmV0dXJuICh0aGlzLl9nZXRJbnQobiA+Pj4gNSkgJiAoMSA8PCAobiAmIDMxKSkpICE9IDA7XG59XG5cbkJpZ0ludGVnZXIucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICB2YXIgX2JpZ0ludGVnZXIgPSBuZXcgQmlnSW50ZWdlcigpO1xuICBfYmlnSW50ZWdlci5zaWdudW0gPSB0aGlzLnNpZ251bTtcbiAgX2JpZ0ludGVnZXIubWFnID0gQ29tbW9uLmNvcHlPZlJhbmdlKHRoaXMubWFnLCAwLCB0aGlzLm1hZy5sZW5ndGgpO1xuICByZXR1cm4gX2JpZ0ludGVnZXI7XG59O1xuXG4vKlxuICogUmV0dXJucyAtMSwgMCBvciArMSBhcyBiaWctZW5kaWFuIHVuc2lnbmVkIGludCBhcnJheSBhcmcxIGlzIGxlc3MgdGhhbixcbiAqIGVxdWFsIHRvLCBvciBncmVhdGVyIHRoYW4gYXJnMiB1cCB0byBsZW5ndGggbGVuLlxuICovXG5mdW5jdGlvbiBpbnRBcnJheUNtcFRvTGVuKGFyZzEsIGFyZzIsIGxlbikge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgdmFyIGIxID0gTG9uZy5mcm9tTnVtYmVyKGFyZzFbaV0gPj4+IDMyKTtcbiAgICB2YXIgYjIgPSBMb25nLmZyb21OdW1iZXIoYXJnMltpXSA+Pj4gMzIpO1xuICAgIGlmIChiMS5jb21wYXJlKGIyKSA8IDApXG4gICAgICByZXR1cm4gLTE7XG4gICAgaWYgKGIxLmNvbXBhcmUoYjIpID4gMClcbiAgICAgIHJldHVybiAxO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG4vKipcbiAqIFN1YnRyYWN0cyB0d28gbnVtYmVycyBvZiBzYW1lIGxlbmd0aCwgcmV0dXJuaW5nIGJvcnJvdy5cbiAqL1xuZnVuY3Rpb24gc3ViTihhLCBiLCBsZW4pIHtcbiAgdmFyIHN1bSA9IExvbmcuWkVSTztcblxuICB3aGlsZSgtLWxlbiA+PSAwKSB7XG4gICAgc3VtID0gTG9uZy5mcm9tTnVtYmVyKGFbbGVuXSA+Pj4gMzIpLnN1YnRyYWN0KExvbmcuZnJvbU51bWJlcihiW2xlbl0gPj4+IDMyKSkuYWRkKHN1bS5zaGlmdFJpZ2h0KDMyKSk7XG4gICAgYVtsZW5dID0gc3VtLmxvdztcbiAgfVxuXG4gIHJldHVybiBzdW0uc2hpZnRSaWdodCgzMikubG93O1xufVxuXG4vKipcbiAqIE1vbnRnb21lcnkgcmVkdWNlIG4sIG1vZHVsbyBtb2QuICBUaGlzIHJlZHVjZXMgbW9kdWxvIG1vZCBhbmQgZGl2aWRlc1xuICogYnkgMl4oMzIqbWxlbikuIEFkYXB0ZWQgZnJvbSBDb2xpbiBQbHVtYidzIEMgbGlicmFyeS5cbiAqIGludFtdIG4sIGludFtdIG1vZCwgaW50IG1sZW4sIGludCBpbnZcbiAqL1xudmFyIG1vbnRSZWR1Y2UgPSBCaWdJbnRlZ2VyLm1vbnRSZWR1Y2UgPSBmdW5jdGlvbiAobiwgbW9kLCBtbGVuLCBpbnYpIHtcbiAgdmFyIGMgPSAwO1xuICB2YXIgbGVuID0gbWxlbjtcbiAgdmFyIG9mZnNldCA9IDA7XG5cbiAgZG8ge1xuICAgIHZhciBuRW5kID0gbltuLmxlbmd0aCAtIDEgLSBvZmZzZXRdO1xuICAgIHZhciBjYXJyeSA9IG11bEFkZChuLCBtb2QsIG9mZnNldCwgbWxlbiwgTG9uZy5mcm9tTnVtYmVyKGludikubXVsdGlwbHkoTG9uZy5mcm9tTnVtYmVyKG5FbmQpKS5sb3cpO1xuICAgIFxuICAgIGMgKz0gYWRkT25lKG4sIG9mZnNldCwgbWxlbiwgY2FycnkpO1xuICAgIG9mZnNldCsrO1xuICB9IHdoaWxlKC0tbGVuID4gMCk7XG5cbiAgd2hpbGUoYz4wKVxuICAgICAgYyArPSBzdWJOKG4sIG1vZCwgbWxlbik7XG5cbiAgd2hpbGUgKGludEFycmF5Q21wVG9MZW4obiwgbW9kLCBtbGVuKSA+PSAwKVxuICAgICAgc3ViTihuLCBtb2QsIG1sZW4pO1xuXG4gIHJldHVybiBuO1xufVxuXG4vKipcbiAqIExlZnQgc2hpZnQgaW50IGFycmF5IGEgdXAgdG8gbGVuIGJ5IG4gYml0cy4gUmV0dXJucyB0aGUgYXJyYXkgdGhhdFxuICogcmVzdWx0cyBmcm9tIHRoZSBzaGlmdCBzaW5jZSBzcGFjZSBtYXkgaGF2ZSB0byBiZSByZWFsbG9jYXRlZC5cbiAqL1xuZnVuY3Rpb24gbGVmdFNoaWZ0KGEsIGxlbiwgbikge1xuICAgIHZhciBuSW50cyA9IG4gPj4+IDU7XG4gICAgdmFyIG5CaXRzID0gbiAmIDB4MUY7XG4gICAgdmFyIGJpdHNJbkhpZ2hXb3JkID0gQmlnSW50ZWdlckxpYi5iaXRMZW5ndGhGb3JJbnQoYVswXSk7XG5cbiAgICAvLyBJZiBzaGlmdCBjYW4gYmUgZG9uZSB3aXRob3V0IHJlY29weSwgZG8gc29cbiAgICBpZiAobiA8PSAoMzItYml0c0luSGlnaFdvcmQpKSB7XG4gICAgICBwcmltaXRpdmVMZWZ0U2hpZnQoYSwgbGVuLCBuQml0cyk7XG4gICAgICByZXR1cm4gYTtcbiAgICB9IGVsc2UgeyAvLyBBcnJheSBtdXN0IGJlIHJlc2l6ZWRcbiAgICAgIGlmIChuQml0cyA8PSAoMzItYml0c0luSGlnaFdvcmQpKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkobkludHMrbGVuKTtcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKVxuICAgICAgICAgIHJlc3VsdFtpXSA9IGFbaV07XG4gICAgICAgIHByaW1pdGl2ZUxlZnRTaGlmdChyZXN1bHQsIHJlc3VsdC5sZW5ndGgsIG5CaXRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkobkludHMgKyBsZW4gKyAxKTtcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKVxuICAgICAgICAgIHJlc3VsdFtpXSA9IGFbaV07XG4gICAgICAgIHByaW1pdGl2ZVJpZ2h0U2hpZnQocmVzdWx0LCByZXN1bHQubGVuZ3RoLCAzMiAtIG5CaXRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMgeCB0byB0aGUgcG93ZXIgb2YgeSBtb2Qgei5cbiAqIEFzc3VtZXM6IHogaXMgb2RkICYmIHggPCB6LlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5vZGRNb2RQb3cgPSBmdW5jdGlvbiAoeSwgeikge1xuLypcbiAqIFRoZSBhbGdvcml0aG0gaXMgYWRhcHRlZCBmcm9tIENvbGluIFBsdW1iJ3MgQyBsaWJyYXJ5LlxuICpcbiAqIFRoZSB3aW5kb3cgYWxnb3JpdGhtOlxuICogVGhlIGlkZWEgaXMgdG8ga2VlcCBhIHJ1bm5pbmcgcHJvZHVjdCBvZiBiMSA9IG5eKGhpZ2gtb3JkZXIgYml0cyBvZiBleHApXG4gKiBhbmQgdGhlbiBrZWVwIGFwcGVuZGluZyBleHBvbmVudCBiaXRzIHRvIGl0LiAgVGhlIGZvbGxvd2luZyBwYXR0ZXJuc1xuICogYXBwbHkgdG8gYSAzLWJpdCB3aW5kb3cgKGsgPSAzKTpcbiAqIFRvIGFwcGVuZCAgIDA6IHNxdWFyZVxuICogVG8gYXBwZW5kICAgMTogc3F1YXJlLCBtdWx0aXBseSBieSBuXjFcbiAqIFRvIGFwcGVuZCAgMTA6IHNxdWFyZSwgbXVsdGlwbHkgYnkgbl4xLCBzcXVhcmVcbiAqIFRvIGFwcGVuZCAgMTE6IHNxdWFyZSwgc3F1YXJlLCBtdWx0aXBseSBieSBuXjNcbiAqIFRvIGFwcGVuZCAxMDA6IHNxdWFyZSwgbXVsdGlwbHkgYnkgbl4xLCBzcXVhcmUsIHNxdWFyZVxuICogVG8gYXBwZW5kIDEwMTogc3F1YXJlLCBzcXVhcmUsIHNxdWFyZSwgbXVsdGlwbHkgYnkgbl41XG4gKiBUbyBhcHBlbmQgMTEwOiBzcXVhcmUsIHNxdWFyZSwgbXVsdGlwbHkgYnkgbl4zLCBzcXVhcmVcbiAqIFRvIGFwcGVuZCAxMTE6IHNxdWFyZSwgc3F1YXJlLCBzcXVhcmUsIG11bHRpcGx5IGJ5IG5eN1xuICpcbiAqIFNpbmNlIGVhY2ggcGF0dGVybiBpbnZvbHZlcyBvbmx5IG9uZSBtdWx0aXBseSwgdGhlIGxvbmdlciB0aGUgcGF0dGVyblxuICogdGhlIGJldHRlciwgZXhjZXB0IHRoYXQgYSAwIChubyBtdWx0aXBsaWVzKSBjYW4gYmUgYXBwZW5kZWQgZGlyZWN0bHkuXG4gKiBXZSBwcmVjb21wdXRlIGEgdGFibGUgb2Ygb2RkIHBvd2VycyBvZiBuLCB1cCB0byAyXmssIGFuZCBjYW4gdGhlblxuICogbXVsdGlwbHkgayBiaXRzIG9mIGV4cG9uZW50IGF0IGEgdGltZS4gIEFjdHVhbGx5LCBhc3N1bWluZyByYW5kb21cbiAqIGV4cG9uZW50cywgdGhlcmUgaXMgb24gYXZlcmFnZSBvbmUgemVybyBiaXQgYmV0d2VlbiBuZWVkcyB0b1xuICogbXVsdGlwbHkgKDEvMiBvZiB0aGUgdGltZSB0aGVyZSdzIG5vbmUsIDEvNCBvZiB0aGUgdGltZSB0aGVyZSdzIDEsXG4gKiAxLzggb2YgdGhlIHRpbWUsIHRoZXJlJ3MgMiwgMS8zMiBvZiB0aGUgdGltZSwgdGhlcmUncyAzLCBldGMuKSwgc29cbiAqIHlvdSBoYXZlIHRvIGRvIG9uZSBtdWx0aXBseSBwZXIgaysxIGJpdHMgb2YgZXhwb25lbnQuXG4gKlxuICogVGhlIGxvb3Agd2Fsa3MgZG93biB0aGUgZXhwb25lbnQsIHNxdWFyaW5nIHRoZSByZXN1bHQgYnVmZmVyIGFzXG4gKiBpdCBnb2VzLiAgVGhlcmUgaXMgYSB3Yml0cysxIGJpdCBsb29rYWhlYWQgYnVmZmVyLCBidWYsIHRoYXQgaXNcbiAqIGZpbGxlZCB3aXRoIHRoZSB1cGNvbWluZyBleHBvbmVudCBiaXRzLiAgKFdoYXQgaXMgcmVhZCBhZnRlciB0aGVcbiAqIGVuZCBvZiB0aGUgZXhwb25lbnQgaXMgdW5pbXBvcnRhbnQsIGJ1dCBpdCBpcyBmaWxsZWQgd2l0aCB6ZXJvIGhlcmUuKVxuICogV2hlbiB0aGUgbW9zdC1zaWduaWZpY2FudCBiaXQgb2YgdGhpcyBidWZmZXIgYmVjb21lcyBzZXQsIGkuZS5cbiAqIChidWYgJiB0YmxtYXNrKSAhPSAwLCB3ZSBoYXZlIHRvIGRlY2lkZSB3aGF0IHBhdHRlcm4gdG8gbXVsdGlwbHlcbiAqIGJ5LCBhbmQgd2hlbiB0byBkbyBpdC4gIFdlIGRlY2lkZSwgcmVtZW1iZXIgdG8gZG8gaXQgaW4gZnV0dXJlXG4gKiBhZnRlciBhIHN1aXRhYmxlIG51bWJlciBvZiBzcXVhcmluZ3MgaGF2ZSBwYXNzZWQgKGUuZy4gYSBwYXR0ZXJuXG4gKiBvZiBcIjEwMFwiIGluIHRoZSBidWZmZXIgcmVxdWlyZXMgdGhhdCB3ZSBtdWx0aXBseSBieSBuXjEgaW1tZWRpYXRlbHk7XG4gKiBhIHBhdHRlcm4gb2YgXCIxMTBcIiBjYWxscyBmb3IgbXVsdGlwbHlpbmcgYnkgbl4zIGFmdGVyIG9uZSBtb3JlXG4gKiBzcXVhcmluZyksIGNsZWFyIHRoZSBidWZmZXIsIGFuZCBjb250aW51ZS5cbiAqXG4gKiBXaGVuIHdlIHN0YXJ0LCB0aGVyZSBpcyBvbmUgbW9yZSBvcHRpbWl6YXRpb246IHRoZSByZXN1bHQgYnVmZmVyXG4gKiBpcyBpbXBsY2l0bHkgb25lLCBzbyBzcXVhcmluZyBpdCBvciBtdWx0aXBseWluZyBieSBpdCBjYW4gYmVcbiAqIG9wdGltaXplZCBhd2F5LiAgRnVydGhlciwgaWYgd2Ugc3RhcnQgd2l0aCBhIHBhdHRlcm4gbGlrZSBcIjEwMFwiXG4gKiBpbiB0aGUgbG9va2FoZWFkIHdpbmRvdywgcmF0aGVyIHRoYW4gcGxhY2luZyBuIGludG8gdGhlIGJ1ZmZlclxuICogYW5kIHRoZW4gc3RhcnRpbmcgdG8gc3F1YXJlIGl0LCB3ZSBoYXZlIGFscmVhZHkgY29tcHV0ZWQgbl4yXG4gKiB0byBjb21wdXRlIHRoZSBvZGQtcG93ZXJzIHRhYmxlLCBzbyB3ZSBjYW4gcGxhY2UgdGhhdCBpbnRvXG4gKiB0aGUgYnVmZmVyIGFuZCBzYXZlIGEgc3F1YXJpbmcuXG4gKlxuICogVGhpcyBtZWFucyB0aGF0IGlmIHlvdSBoYXZlIGEgay1iaXQgd2luZG93LCB0byBjb21wdXRlIG5eeixcbiAqIHdoZXJlIHogaXMgdGhlIGhpZ2ggayBiaXRzIG9mIHRoZSBleHBvbmVudCwgMS8yIG9mIHRoZSB0aW1lXG4gKiBpdCByZXF1aXJlcyBubyBzcXVhcmluZ3MuICAxLzQgb2YgdGhlIHRpbWUsIGl0IHJlcXVpcmVzIDFcbiAqIHNxdWFyaW5nLCAuLi4gMS8yXihrLTEpIG9mIHRoZSB0aW1lLCBpdCByZXFpcmVzIGstMiBzcXVhcmluZ3MuXG4gKiBBbmQgdGhlIHJlbWFpbmluZyAxLzJeKGstMSkgb2YgdGhlIHRpbWUsIHRoZSB0b3AgayBiaXRzIGFyZSBhXG4gKiAxIGZvbGxvd2VkIGJ5IGstMSAwIGJpdHMsIHNvIGl0IGFnYWluIG9ubHkgcmVxdWlyZXMgay0yXG4gKiBzcXVhcmluZ3MsIG5vdCBrLTEuICBUaGUgYXZlcmFnZSBvZiB0aGVzZSBpcyAxLiAgQWRkIHRoYXRcbiAqIHRvIHRoZSBvbmUgc3F1YXJpbmcgd2UgaGF2ZSB0byBkbyB0byBjb21wdXRlIHRoZSB0YWJsZSxcbiAqIGFuZCB5b3UnbGwgc2VlIHRoYXQgYSBrLWJpdCB3aW5kb3cgc2F2ZXMgay0yIHNxdWFyaW5nc1xuICogYXMgd2VsbCBhcyByZWR1Y2luZyB0aGUgbXVsdGlwbGllcy4gIChJdCBhY3R1YWxseSBkb2Vzbid0XG4gKiBodXJ0IGluIHRoZSBjYXNlIGsgPSAxLCBlaXRoZXIuKVxuICovXG4gIC8vIFNwZWNpYWwgY2FzZSBmb3IgZXhwb25lbnQgb2Ygb25lXG4gIGlmICh5LmVxdWFscyhPTkUpKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIFNwZWNpYWwgY2FzZSBmb3IgYmFzZSBvZiB6ZXJvXG4gIGlmICh0aGlzLnNpZ251bT09MClcbiAgICAgIHJldHVybiBaRVJPO1xuXG4gIHZhciBiYXNlID0gQ29tbW9uLmNvcHlPZlJhbmdlKHRoaXMubWFnLCAwLCB0aGlzLm1hZy5sZW5ndGgpO1xuICB2YXIgZXhwID0geS5tYWc7XG4gIHZhciBtb2QgPSB6Lm1hZztcbiAgdmFyIG1vZExlbiA9IG1vZC5sZW5ndGg7XG5cbiAgLy8gU2VsZWN0IGFuIGFwcHJvcHJpYXRlIHdpbmRvdyBzaXplXG4gIHZhciB3Yml0cyA9IDA7XG4gIHZhciBlYml0cyA9IEJpZ0ludGVnZXJMaWIuYml0TGVuZ3RoKGV4cCwgZXhwLmxlbmd0aCk7XG4gIC8vIGlmIGV4cG9uZW50IGlzIDY1NTM3ICgweDEwMDAxKSwgdXNlIG1pbmltdW0gd2luZG93IHNpemVcbiAgaWYgKChlYml0cyAhPSAxNykgfHwgKGV4cFswXSAhPSA2NTUzNykpIHtcbiAgICB3aGlsZSAoZWJpdHMgPiBibkV4cE1vZFRocmVzaFRhYmxlW3diaXRzXSkge1xuICAgICAgd2JpdHMrKztcbiAgICB9XG4gIH1cblxuICAvLyBDYWxjdWxhdGUgYXBwcm9wcmlhdGUgdGFibGUgc2l6ZVxuICB2YXIgdGJsbWFzayA9IDEgPDwgd2JpdHM7XG5cbiAgLy8gQWxsb2NhdGUgdGFibGUgZm9yIHByZWNvbXB1dGVkIG9kZCBwb3dlcnMgb2YgYmFzZSBpbiBNb250Z29tZXJ5IGZvcm1cbiAgdmFyIHRhYmxlID0gbmV3IEFycmF5KHRibG1hc2spO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRibG1hc2s7IGkrKykge1xuICAgIHRhYmxlW2ldID0gQ29tbW9uLmludEFycmF5KG1vZExlbik7XG4gIH1cblxuICAvLyBDb21wdXRlIHRoZSBtb2R1bGFyIGludmVyc2VcbiAgdmFyIGludiA9IC1NdXRhYmxlQmlnSW50ZWdlci5pbnZlcnNlTW9kMzIobW9kW21vZExlbi0xXSk7XG4gIFxuICAvLyBDb252ZXJ0IGJhc2UgdG8gTW9udGdvbWVyeSBmb3JtXG4gIHZhciBhID0gbGVmdFNoaWZ0KGJhc2UsIGJhc2UubGVuZ3RoLCBtb2RMZW4gPDwgNSk7XG5cbiAgdmFyIHEgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoKTtcbiAgdmFyIGEyID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKGEpO1xuICB2YXIgYjIgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIobW9kKTtcblxuICB2YXIgciA9IGEyLmRpdmlkZShiMiwgcSk7XG5cbiAgdGFibGVbMF0gPSByLnRvSW50QXJyYXkoKTtcbiAgLy8gUGFkIHRhYmxlWzBdIHdpdGggbGVhZGluZyB6ZXJvcyBzbyBpdHMgbGVuZ3RoIGlzIGF0IGxlYXN0IG1vZExlblxuICBpZiAodGFibGVbMF0ubGVuZ3RoIDwgbW9kTGVuKSB7XG4gICAgIHZhciBvZmZzZXQgPSBtb2RMZW4gLSB0YWJsZVswXS5sZW5ndGg7XG4gICAgIHZhciB0MiA9IENvbW1vbi5pbnRBcnJheShtb2RMZW4pO1xuICAgICBmb3IgKHZhciBpPTA7IGkgPCB0YWJsZVswXS5sZW5ndGg7IGkrKylcbiAgICAgICAgIHQyW2krb2Zmc2V0XSA9IHRhYmxlWzBdW2ldO1xuICAgICB0YWJsZVswXSA9IHQyO1xuICB9XG5cbiAgLy8gU2V0IGIgdG8gdGhlIHNxdWFyZSBvZiB0aGUgYmFzZVxuICB2YXIgYiA9IHNxdWFyZVRvTGVuKHRhYmxlWzBdLCBtb2RMZW4sIG51bGwpO1xuXG4gIGIgPSBtb250UmVkdWNlKGIsIG1vZCwgbW9kTGVuLCBpbnYpO1xuXG4gIC8vIFNldCB0IHRvIGhpZ2ggaGFsZiBvZiBiXG4gIHZhciB0ID0gQ29tbW9uLmludEFycmF5KG1vZExlbik7XG4gIGZvcih2YXIgaSA9IDA7IGkgPCBtb2RMZW47IGkrKylcbiAgICB0W2ldID0gYltpXTtcblxuICAvLyBGaWxsIGluIHRoZSB0YWJsZSB3aXRoIG9kZCBwb3dlcnMgb2YgdGhlIGJhc2VcbiAgZm9yICh2YXIgaT0xOyBpIDwgdGJsbWFzazsgaSsrKSB7XG4gICAgdmFyIHByb2QgPSBtdWx0aXBseVRvTGVuKHQsIG1vZExlbiwgdGFibGVbaS0xXSwgbW9kTGVuLCBudWxsKTtcbiAgICB0YWJsZVtpXSA9IG1vbnRSZWR1Y2UocHJvZCwgbW9kLCBtb2RMZW4sIGludik7XG4gIH1cblxuICAvLyBQcmUgbG9hZCB0aGUgd2luZG93IHRoYXQgc2xpZGVzIG92ZXIgdGhlIGV4cG9uZW50XG4gIHZhciBiaXRwb3MgPSAxIDw8ICgoZWJpdHMtMSkgJiAoMzItMSkpO1xuXG4gIHZhciBidWYgPSAwO1xuICB2YXIgZWxlbiA9IGV4cC5sZW5ndGg7XG4gIHZhciBlSW5kZXggPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8PSB3Yml0czsgaSsrKSB7XG4gICAgYnVmID0gKGJ1ZiA8PCAxKSB8ICgoKGV4cFtlSW5kZXhdICYgYml0cG9zKSAhPSAwKSA/IDEgOiAwKTtcbiAgICBiaXRwb3MgPj4+PSAxO1xuICAgIGlmIChiaXRwb3MgPT0gMCkge1xuICAgICAgZUluZGV4Kys7XG4gICAgICBiaXRwb3MgPSAxIDw8ICgzMi0xKTtcbiAgICAgIGVsZW4tLTtcbiAgICB9XG4gIH1cblxuICB2YXIgbXVsdHBvcyA9IGViaXRzO1xuXG4gIC8vIFRoZSBmaXJzdCBpdGVyYXRpb24sIHdoaWNoIGlzIGhvaXN0ZWQgb3V0IG9mIHRoZSBtYWluIGxvb3BcbiAgZWJpdHMtLTtcbiAgdmFyIGlzb25lID0gdHJ1ZTtcblxuICBtdWx0cG9zID0gZWJpdHMgLSB3Yml0cztcblxuICB3aGlsZSAoKGJ1ZiAmIDEpID09PSAwKSB7XG4gICAgYnVmID4+Pj0gMTtcbiAgICBtdWx0cG9zKys7XG4gIH1cblxuICB2YXIgbXVsdCA9IHRhYmxlW2J1ZiA+Pj4gMV07XG5cbiAgYnVmID0gMDtcbiAgaWYgKG11bHRwb3MgPT0gZWJpdHMpXG4gICAgICBpc29uZSA9IGZhbHNlO1xuXG4gIC8vIFRoZSBtYWluIGxvb3BcbiAgd2hpbGUodHJ1ZSkge1xuICAgICAgZWJpdHMtLTtcbiAgICAgIC8vIEFkdmFuY2UgdGhlIHdpbmRvd1xuICAgICAgYnVmIDw8PSAxO1xuXG4gICAgICBpZiAoZWxlbiAhPSAwKSB7XG4gICAgICAgICAgYnVmIHw9ICgoZXhwW2VJbmRleF0gJiBiaXRwb3MpICE9IDApID8gMSA6IDA7XG4gICAgICAgICAgYml0cG9zID4+Pj0gMTtcbiAgICAgICAgICBpZiAoYml0cG9zID09IDApIHtcbiAgICAgICAgICAgICAgZUluZGV4Kys7XG4gICAgICAgICAgICAgIGJpdHBvcyA9IDEgPDwgKDMyLTEpO1xuICAgICAgICAgICAgICBlbGVuLS07XG4gICAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBFeGFtaW5lIHRoZSB3aW5kb3cgZm9yIHBlbmRpbmcgbXVsdGlwbGllc1xuICAgICAgaWYgKChidWYgJiB0YmxtYXNrKSAhPSAwKSB7XG4gICAgICAgIG11bHRwb3MgPSBlYml0cyAtIHdiaXRzO1xuICAgICAgICB3aGlsZSAoKGJ1ZiAmIDEpID09IDApIHtcbiAgICAgICAgICBidWYgPj4+PSAxO1xuICAgICAgICAgIG11bHRwb3MrKztcbiAgICAgICAgfVxuICAgICAgICBtdWx0ID0gdGFibGVbYnVmID4+PiAxXTtcbiAgICAgICAgYnVmID0gMDtcbiAgICAgIH1cblxuICAgICAgLy8gUGVyZm9ybSBtdWx0aXBseVxuICAgICAgaWYgKGViaXRzID09IG11bHRwb3MpIHtcbiAgICAgICAgICBpZiAoaXNvbmUpIHtcbiAgICAgICAgICAgICAgYiA9IGNsb25lKG11bHQpO1xuICAgICAgICAgICAgICBpc29uZSA9IGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHQgPSBiO1xuICAgICAgICAgICAgICBhID0gbXVsdGlwbHlUb0xlbih0LCBtb2RMZW4sIG11bHQsIG1vZExlbiwgYSk7XG4gICAgICAgICAgICAgIGEgPSBtb250UmVkdWNlKGEsIG1vZCwgbW9kTGVuLCBpbnYpO1xuICAgICAgICAgICAgICB0ID0gYTsgYSA9IGI7IGIgPSB0O1xuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgZG9uZVxuICAgICAgaWYgKGViaXRzID09IDApXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgIC8vIFNxdWFyZSB0aGUgaW5wdXRcbiAgICAgIGlmICghaXNvbmUpIHtcbiAgICAgICAgICB0ID0gYjtcbiAgICAgICAgICBhID0gc3F1YXJlVG9MZW4odCwgbW9kTGVuLCBhKTtcbiAgICAgICAgICBhID0gbW9udFJlZHVjZShhLCBtb2QsIG1vZExlbiwgaW52KTtcbiAgICAgICAgICB0ID0gYTsgYSA9IGI7IGIgPSB0O1xuICAgICAgfVxuICB9XG5cbiAgLy8gQ29udmVydCByZXN1bHQgb3V0IG9mIE1vbnRnb21lcnkgZm9ybSBhbmQgcmV0dXJuXG4gIHZhciB0MiA9IENvbW1vbi5pbnRBcnJheSgyICogbW9kTGVuKTtcbiAgZm9yKHZhciBpID0gMDsgaSA8IG1vZExlbjsgaSsrKVxuICAgICAgdDJbaSArIG1vZExlbl0gPSBiW2ldO1xuICAgIFxuICBiID0gbW9udFJlZHVjZSh0MiwgbW9kLCBtb2RMZW4sIGludik7XG4gIFxuICB0MiA9IENvbW1vbi5pbnRBcnJheShtb2RMZW4pO1xuICBmb3IodmFyIGk9MDsgaTxtb2RMZW47IGkrKylcbiAgICB0MltpXSA9IGJbaV07XG5cbiAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyh0MiwgMSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIHJpZ2h0bW9zdCAobG93ZXN0LW9yZGVyKSBvbmUgYml0IGluIHRoaXNcbiAqIEJpZ0ludGVnZXIgKHRoZSBudW1iZXIgb2YgemVybyBiaXRzIHRvIHRoZSByaWdodCBvZiB0aGUgcmlnaHRtb3N0XG4gKiBvbmUgYml0KS4gIFJldHVybnMgLTEgaWYgdGhpcyBCaWdJbnRlZ2VyIGNvbnRhaW5zIG5vIG9uZSBiaXRzLlxuICogKENvbXB1dGVzIHtAY29kZSAodGhpcz09MD8gLTEgOiBsb2cyKHRoaXMgJiAtdGhpcykpfS4pXG4gKlxuICogQHJldHVybiBpbmRleCBvZiB0aGUgcmlnaHRtb3N0IG9uZSBiaXQgaW4gdGhpcyBCaWdJbnRlZ2VyLlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5nZXRMb3dlc3RTZXRCaXQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBsc2IgPSB0aGlzLmxvd2VzdFNldEJpdCAtIDI7XG4gIGlmIChsc2IgPT0gLTIpIHsgIC8vIGxvd2VzdFNldEJpdCBub3QgaW5pdGlhbGl6ZWQgeWV0XG4gICAgbHNiID0gMDtcbiAgICBpZiAodGhpcy5zaWdudW0gPT0gMCkge1xuICAgICAgICBsc2IgLT0gMTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTZWFyY2ggZm9yIGxvd2VzdCBvcmRlciBub256ZXJvIGludFxuICAgICAgICB2YXIgaSxiO1xuICAgICAgICBmb3IgKGk9MDsgKGIgPSB0aGlzLl9nZXRJbnQoaSkpPT0wOyBpKyspXG4gICAgICAgICAgICA7XG4gICAgICAgIGxzYiArPSAoaSA8PCA1KSArIEludGVnZXIubnVtYmVyT2ZUcmFpbGluZ1plcm9zKGIpO1xuICAgIH1cbiAgICB0aGlzLmxvd2VzdFNldEJpdCA9IGxzYiArIDI7XG4gIH1cbiAgcmV0dXJuIGxzYjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpcyB7QGNvZGUgKHRoaXN9PHN1cD4tMTwvc3VwPiB7QGNvZGUgbW9kIG0pfS5cbiAqXG4gKiBAcGFyYW0gIG0gdGhlIG1vZHVsdXMuXG4gKiBAcmV0dXJuIHtAY29kZSB0aGlzfTxzdXA+LTE8L3N1cD4ge0Bjb2RlIG1vZCBtfS5cbiAqIEB0aHJvd3MgQXJpdGhtZXRpY0V4Y2VwdGlvbiB7QGNvZGUgIG19ICZsZTsgMCwgb3IgdGhpcyBCaWdJbnRlZ2VyXG4gKiAgICAgICAgIGhhcyBubyBtdWx0aXBsaWNhdGl2ZSBpbnZlcnNlIG1vZCBtICh0aGF0IGlzLCB0aGlzIEJpZ0ludGVnZXJcbiAqICAgICAgICAgaXMgbm90IDxpPnJlbGF0aXZlbHkgcHJpbWU8L2k+IHRvIG0pLlxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5tb2RJbnZlcnNlID0gZnVuY3Rpb24gKG0pIHtcbiAgaWYgKG0uc2lnbnVtICE9IDEpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCaWdJbnRlZ2VyOiBtb2R1bHVzIG5vdCBwb3NpdGl2ZVwiKTtcblxuICBpZiAobS5lcXVhbHMoT05FKSlcbiAgICByZXR1cm4gWkVSTztcblxuICAvLyBDYWxjdWxhdGUgKHRoaXMgbW9kIG0pXG4gIHZhciBtb2RWYWwgPSB0aGlzO1xuICBpZiAodGhpcy5zaWdudW0gPCAwIHx8ICh0aGlzLmNvbXBhcmVNYWduaXR1ZGUobSkgPj0gMCkpXG4gICAgICBtb2RWYWwgPSB0aGlzLm1vZChtKTtcblxuICBpZiAobW9kVmFsLmVxdWFscyhPTkUpKVxuICAgICAgcmV0dXJuIE9ORTtcblxuICB2YXIgYSA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcihtb2RWYWwpO1xuICB2YXIgYiA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcihtKTtcblxuICB2YXIgcmVzdWx0ID0gYS5tdXRhYmxlTW9kSW52ZXJzZShiKTtcblxuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTXV0YWJsZUJpZ0ludGVnZXIocmVzdWx0LCAxKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpcyAodGhpcyAqKiBleHBvbmVudCkgbW9kICgyKipwKVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5tb2RQb3cyID0gZnVuY3Rpb24gKGV4cG9uZW50LCBwKSB7XG4gIC8qXG4gICAqIFBlcmZvcm0gZXhwb25lbnRpYXRpb24gdXNpbmcgcmVwZWF0ZWQgc3F1YXJpbmcgdHJpY2ssIGNob3BwaW5nIG9mZlxuICAgKiBoaWdoIG9yZGVyIGJpdHMgYXMgaW5kaWNhdGVkIGJ5IG1vZHVsdXMuXG4gICAqL1xuICB2YXIgcmVzdWx0ID0gQmlnSW50ZWdlci52YWx1ZU9mKExvbmcuZnJvbU51bWJlcigxKSk7XG4gIHZhciBiYXNlVG9Qb3cyID0gdGhpcy5tb2QyKHApO1xuICB2YXIgZXhwT2Zmc2V0ID0gMDtcblxuICB2YXIgbGltaXQgPSBleHBvbmVudC5iaXRMZW5ndGgoKTtcblxuICBpZiAodGhpcy50ZXN0Qml0KDApKVxuICAgICBsaW1pdCA9IChwLTEpIDwgbGltaXQgPyAocC0xKSA6IGxpbWl0O1xuXG4gIHdoaWxlIChleHBPZmZzZXQgPCBsaW1pdCkge1xuICAgIGlmIChleHBvbmVudC50ZXN0Qml0KGV4cE9mZnNldCkpXG4gICAgICByZXN1bHQgPSByZXN1bHQubXVsdGlwbHkoYmFzZVRvUG93MikubW9kMihwKTtcbiAgICBleHBPZmZzZXQrKztcbiAgICBpZiAoZXhwT2Zmc2V0IDwgbGltaXQpXG4gICAgICBiYXNlVG9Qb3cyID0gYmFzZVRvUG93Mi5zcXVhcmUoKS5tb2QyKHApO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpcyB7QGNvZGUgKHRoaXM8c3VwPjI8L3N1cD4pfS5cbiAqXG4gKiBAcmV0dXJuIHtAY29kZSB0aGlzPHN1cD4yPC9zdXA+fVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5zcXVhcmUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnNpZ251bSA9PSAwKVxuICAgIHJldHVybiBaRVJPO1xuICB2YXIgeiA9IHNxdWFyZVRvTGVuKHRoaXMubWFnLCB0aGlzLm1hZy5sZW5ndGgsIG51bGwpO1xuICByZXR1cm4gQmlnSW50ZWdlci5mcm9tTWFnKHRydXN0ZWRTdHJpcExlYWRpbmdaZXJvSW50cyh6KSwgMSk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIEJpZ0ludGVnZXIgd2hvc2UgdmFsdWUgaXMgdGhpcyBtb2QoMioqcCkuXG4gKiBBc3N1bWVzIHRoYXQgdGhpcyB7QGNvZGUgQmlnSW50ZWdlciA+PSAwfSBhbmQge0Bjb2RlIHAgPiAwfS5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUubW9kMiA9IGZ1bmN0aW9uIChwKSB7XG4gICAgaWYgKHRoaXMuYml0TGVuZ3RoKCkgPD0gcClcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIC8vIENvcHkgcmVtYWluaW5nIGludHMgb2YgbWFnXG4gICAgdmFyIG51bUludHMgPSAocCArIDMxKSA+Pj4gNTtcbiAgICB2YXIgbWFnID0gQ29tbW9uLmludEFycmF5KG51bUludHMpO1xuICAgIGZvciAodmFyIGk9MDsgaTxudW1JbnRzOyBpKyspXG4gICAgICAgIG1hZ1tpXSA9IHRoaXMubWFnW2kgKyAodGhpcy5tYWcubGVuZ3RoIC0gbnVtSW50cyldO1xuXG4gICAgLy8gTWFzayBvdXQgYW55IGV4Y2VzcyBiaXRzXG4gICAgdmFyIGV4Y2Vzc0JpdHMgPSAobnVtSW50cyA8PCA1KSAtIHA7XG4gICAgbWFnWzBdICY9IExvbmcuZnJvbUludCgxKS5zaGlmdExlZnQoMzItZXhjZXNzQml0cykubG93IC0gMTtcblxuICAgIHJldHVybiAobWFnWzBdPT0wID8gX2Zyb21NYWcoMSwgbWFnKSA6IEJpZ0ludGVnZXIuZnJvbU1hZyhtYWcsIDEpKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgQmlnSW50ZWdlciB3aG9zZSB2YWx1ZSBpc1xuICogPHR0Pih0aGlzPHN1cD5leHBvbmVudDwvc3VwPiBtb2QgbSk8L3R0Pi4gIChVbmxpa2Uge0Bjb2RlIHBvd30sIHRoaXNcbiAqIG1ldGhvZCBwZXJtaXRzIG5lZ2F0aXZlIGV4cG9uZW50cy4pXG4gKlxuICogQHBhcmFtICBleHBvbmVudCB0aGUgZXhwb25lbnQuXG4gKiBAcGFyYW0gIG0gdGhlIG1vZHVsdXMuXG4gKiBAcmV0dXJuIDx0dD50aGlzPHN1cD5leHBvbmVudDwvc3VwPiBtb2QgbTwvdHQ+XG4gKiBAdGhyb3dzIEFyaXRobWV0aWNFeGNlcHRpb24ge0Bjb2RlIG19ICZsZTsgMCBvciB0aGUgZXhwb25lbnQgaXNcbiAqICAgICAgICAgbmVnYXRpdmUgYW5kIHRoaXMgQmlnSW50ZWdlciBpcyBub3QgPGk+cmVsYXRpdmVseVxuICogICAgICAgICBwcmltZTwvaT4gdG8ge0Bjb2RlIG19LlxuICogQHNlZSAgICAjbW9kSW52ZXJzZVxuICovXG5CaWdJbnRlZ2VyLnByb3RvdHlwZS5tb2RQb3cgPSBmdW5jdGlvbiAoZXhwb25lbnQsIG0pIHtcbiAgaWYgKG0uc2lnbnVtIDw9IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQmlnSW50ZWdlcjogbW9kdWx1cyBub3QgcG9zaXRpdmVcIik7XG5cbiAgLy8gVHJpdmlhbCBjYXNlc1xuICBpZiAoZXhwb25lbnQuc2lnbnVtID09IDApXG4gICAgcmV0dXJuIChtLmVxdWFscyhPTkUpID8gWkVSTyA6IE9ORSk7XG5cbiAgaWYgKHRoaXMuZXF1YWxzKE9ORSkpXG4gICAgcmV0dXJuIChtLmVxdWFscyhPTkUpID8gWkVSTyA6IE9ORSk7XG5cbiAgaWYgKHRoaXMuZXF1YWxzKFpFUk8pICYmIGV4cG9uZW50LnNpZ251bSA+PSAwKVxuICAgIHJldHVybiBaRVJPO1xuXG4gIGlmICh0aGlzLmVxdWFscyhuZWdDb25zdFsxXSkgJiYgKCFleHBvbmVudC50ZXN0Qml0KDApKSlcbiAgICByZXR1cm4gKG0uZXF1YWxzKE9ORSkgPyBaRVJPIDogT05FKTtcblxuICB2YXIgaW52ZXJ0UmVzdWx0O1xuICBpZiAoKGludmVydFJlc3VsdCA9IChleHBvbmVudC5zaWdudW0gPCAwKSkpXG4gICAgZXhwb25lbnQgPSBleHBvbmVudC5uZWdhdGUoKTtcblxuICB2YXIgYmFzZSA9ICgodGhpcy5zaWdudW0gPCAwIHx8IHRoaXMuY29tcGFyZVRvKG0pID49IDApID8gdGhpcy5tb2QobSkgOiB0aGlzKTtcbiAgdmFyIHJlc3VsdDtcbiAgaWYgKG0udGVzdEJpdCgwKSkgeyAvLyBvZGQgbW9kdWx1c1xuICAgIHJlc3VsdCA9IGJhc2Uub2RkTW9kUG93KGV4cG9uZW50LCBtKTtcbiAgfSBlbHNlIHtcbiAgICAvKlxuICAgICAqIEV2ZW4gbW9kdWx1cy4gIFRlYXIgaXQgaW50byBhbiBcIm9kZCBwYXJ0XCIgKG0xKSBhbmQgcG93ZXIgb2YgdHdvXG4gICAgICogKG0yKSwgZXhwb25lbnRpYXRlIG1vZCBtMSwgbWFudWFsbHkgZXhwb25lbnRpYXRlIG1vZCBtMiwgYW5kXG4gICAgICogdXNlIENoaW5lc2UgUmVtYWluZGVyIFRoZW9yZW0gdG8gY29tYmluZSByZXN1bHRzLlxuICAgICAqL1xuXG4gICAgLy8gVGVhciBtIGFwYXJ0IGludG8gb2RkIHBhcnQgKG0xKSBhbmQgcG93ZXIgb2YgMiAobTIpXG4gICAgdmFyIHAgPSBtLmdldExvd2VzdFNldEJpdCgpOyAgIC8vIE1heCBwb3cgb2YgMiB0aGF0IGRpdmlkZXMgbVxuXG4gICAgdmFyIG0xID0gbS5zaGlmdFJpZ2h0KHApOyAgLy8gbS8yKipwXG4gICAgdmFyIG0yID0gT05FLnNoaWZ0TGVmdChwKTsgLy8gMioqcFxuXG4gICAgLy8gQ2FsY3VsYXRlIG5ldyBiYXNlIGZyb20gbTFcbiAgICB2YXIgYmFzZTIgPSAodGhpcy5zaWdudW0gPCAwIHx8IHRoaXMuY29tcGFyZVRvKG0xKSA+PSAwID8gdGhpcy5tb2QobTEpIDogdGhpcyk7XG4gICAgLy8gQ2FjdWxhdGUgKGJhc2UgKiogZXhwb25lbnQpIG1vZCBtMS5cbiAgICB2YXIgYTEgPSAobTEuZXF1YWxzKE9ORSkgPyBaRVJPIDogYmFzZTIub2RkTW9kUG93KGV4cG9uZW50LCBtMSkpO1xuICAgIFxuICAgIC8vIENhbGN1bGF0ZSAodGhpcyAqKiBleHBvbmVudCkgbW9kIG0yXG4gICAgdmFyIGEyID0gYmFzZS5tb2RQb3cyKGV4cG9uZW50LCBwKTtcbiAgICBcbiAgICBhMi5tYWcgPSBbXTtcbiAgICBhMi5zaWdudW0gPSAwO1xuICAgIGEyLmJpdExlbiA9IDE7XG5cbiAgICAvLyBDb21iaW5lIHJlc3VsdHMgdXNpbmcgQ2hpbmVzZSBSZW1haW5kZXIgVGhlb3JlbVxuICAgIHZhciB5MSA9IG0yLm1vZEludmVyc2UobTEpO1xuICAgIHZhciB5MiA9IG0xLm1vZEludmVyc2UobTIpO1xuXG4gICAgcmVzdWx0ID0gYTEubXVsdGlwbHkobTIpLm11bHRpcGx5KHkxKS5hZGQoYTIubXVsdGlwbHkobTEpLm11bHRpcGx5KHkyKSkubW9kKG0pO1xuICB9XG4gIHJldHVybiAoaW52ZXJ0UmVzdWx0ID8gcmVzdWx0Lm1vZEludmVyc2UobSkgOiByZXN1bHQpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIHRoaXMgQmlnSW50ZWdlciB0byBhbiB7QGNvZGUgaW50fS4gIFRoaXNcbiAqIGNvbnZlcnNpb24gaXMgYW5hbG9nb3VzIHRvIGFcbiAqIDxpPm5hcnJvd2luZyBwcmltaXRpdmUgY29udmVyc2lvbjwvaT4gZnJvbSB7QGNvZGUgbG9uZ30gdG9cbiAqIHtAY29kZSBpbnR9IGFzIGRlZmluZWQgaW4gc2VjdGlvbiA1LjEuMyBvZlxuICogPGNpdGU+VGhlIEphdmEmdHJhZGU7IExhbmd1YWdlIFNwZWNpZmljYXRpb248L2NpdGU+OlxuICogaWYgdGhpcyBCaWdJbnRlZ2VyIGlzIHRvbyBiaWcgdG8gZml0IGluIGFuXG4gKiB7QGNvZGUgaW50fSwgb25seSB0aGUgbG93LW9yZGVyIDMyIGJpdHMgYXJlIHJldHVybmVkLlxuICogTm90ZSB0aGF0IHRoaXMgY29udmVyc2lvbiBjYW4gbG9zZSBpbmZvcm1hdGlvbiBhYm91dCB0aGVcbiAqIG92ZXJhbGwgbWFnbml0dWRlIG9mIHRoZSBCaWdJbnRlZ2VyIHZhbHVlIGFzIHdlbGwgYXMgcmV0dXJuIGFcbiAqIHJlc3VsdCB3aXRoIHRoZSBvcHBvc2l0ZSBzaWduLlxuICpcbiAqIEByZXR1cm4gdGhpcyBCaWdJbnRlZ2VyIGNvbnZlcnRlZCB0byBhbiB7QGNvZGUgaW50fS5cbiAqL1xuQmlnSW50ZWdlci5wcm90b3R5cGUuaW50VmFsdWUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciByZXN1bHQgPSB0aGlzLl9nZXRJbnQoMCk7O1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEluaXRpYWxpemUgc3RhdGljIGNvbnN0YW50IGFycmF5IHdoZW4gY2xhc3MgaXMgbG9hZGVkLlxuICovXG52YXIgTUFYX0NPTlNUQU5UID0gMTY7XG52YXIgcG9zQ29uc3QgPSBuZXcgQXJyYXkoTUFYX0NPTlNUQU5UICsgMSk7XG52YXIgbmVnQ29uc3QgPSBuZXcgQXJyYXkoTUFYX0NPTlNUQU5UICsgMSk7XG5cbmZvciAodmFyIGkgPSAxOyBpIDw9IE1BWF9DT05TVEFOVDsgaSsrKSB7XG4gIHZhciBtYWduaXR1ZGUgPSBDb21tb24uaW50QXJyYXkoMSk7XG4gIG1hZ25pdHVkZVswXSA9IGk7XG4gIHBvc0NvbnN0W2ldID0gQmlnSW50ZWdlci5mcm9tTWFnKG1hZ25pdHVkZSwgIDEpO1xuICBuZWdDb25zdFtpXSA9IEJpZ0ludGVnZXIuZnJvbU1hZyhtYWduaXR1ZGUsIC0xKTtcbn1cblxudmFyIGJuRXhwTW9kVGhyZXNoVGFibGUgPSBbNywgMjUsIDgxLCAyNDEsIDY3MywgMTc5MywgSW50ZWdlci5NQVhfVkFMVUVdO1xuXG52YXIgWkVSTyA9IEJpZ0ludGVnZXIuZnJvbU1hZyhbXSwgMCk7XG52YXIgT05FID0gQmlnSW50ZWdlci5mcm9tTWFnKFsxXSwgMSk7XG5cbkJpZ0ludGVnZXIuWkVSTyA9IFpFUk87XG5CaWdJbnRlZ2VyLk9ORSA9IE9ORTtcblxubW9kdWxlLmV4cG9ydHMgPSBCaWdJbnRlZ2VyO1xuXG4iLCJ2YXIgSW50ZWdlciA9IHJlcXVpcmUoJy4vSW50ZWdlcicpO1xuXG4vLyBzaGlmdHMgYSB1cCB0byBsZW4gbGVmdCBuIGJpdHMgYXNzdW1lcyBubyBsZWFkaW5nIHplcm9zLCAwPD1uPDMyXG4vLyBpbnRbXSBhLCBpbnQgbGVuLCBpbnQgblxuZXhwb3J0cy5wcmltaXRpdmVMZWZ0U2hpZnQgPSAgZnVuY3Rpb24gKGEsIGxlbiwgbikge1xuICBpZiAobGVuID09IDAgfHwgbiA9PSAwKVxuICAgIHJldHVybjtcbiAgdmFyIG4yID0gMzIgLSBuO1xuICBmb3IgKHZhciBpPTAsIGM9YVtpXSwgbT1pK2xlbi0xOyBpPG07IGkrKykge1xuICAgIHZhciBiID0gYztcbiAgICBjID0gYVtpKzFdO1xuICAgIGFbaV0gPSAoYiA8PCBuKSB8IChjID4+PiBuMik7XG4gIH1cbiAgYVtsZW4tMV0gPDw9IG47XG59XG5cbnZhciBiaXRMZW5ndGhGb3JJbnQgPSBleHBvcnRzLmJpdExlbmd0aEZvckludCA9IGZ1bmN0aW9uIChpKSB7XG4gIHJldHVybiAzMiAtIEludGVnZXIubnVtYmVyT2ZMZWFkaW5nWmVyb3MoaSk7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlIGJpdGxlbmd0aCBvZiBjb250ZW50cyBvZiB0aGUgZmlyc3QgbGVuIGVsZW1lbnRzIGFuIGludCBhcnJheSxcbiAqIGFzc3VtaW5nIHRoZXJlIGFyZSBubyBsZWFkaW5nIHplcm8gaW50cy5cbiAqLyBcbmV4cG9ydHMuYml0TGVuZ3RoID0gZnVuY3Rpb24gKHZhbCwgbGVuKSB7XG4gIGlmIChsZW4gPT0gMClcbiAgICByZXR1cm4gMDtcbiAgcmV0dXJuICgobGVuIC0gMSkgPDwgNSkgKyBiaXRMZW5ndGhGb3JJbnQodmFsWzBdKTtcbn1cbiIsIlxuZnVuY3Rpb24gSW50ZWdlcigpIHtcblxufVxuLyoqXG4gKiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgemVybyBiaXRzIGZvbGxvd2luZyB0aGUgbG93ZXN0LW9yZGVyIChcInJpZ2h0bW9zdFwiKVxuICogb25lLWJpdCBpbiB0aGUgdHdvJ3MgY29tcGxlbWVudCBiaW5hcnkgcmVwcmVzZW50YXRpb24gb2YgdGhlIHNwZWNpZmllZFxuICoge0Bjb2RlIGludH0gdmFsdWUuICBSZXR1cm5zIDMyIGlmIHRoZSBzcGVjaWZpZWQgdmFsdWUgaGFzIG5vXG4gKiBvbmUtYml0cyBpbiBpdHMgdHdvJ3MgY29tcGxlbWVudCByZXByZXNlbnRhdGlvbiwgaW4gb3RoZXIgd29yZHMgaWYgaXQgaXNcbiAqIGVxdWFsIHRvIHplcm8uXG4gKlxuICogQHJldHVybiB0aGUgbnVtYmVyIG9mIHplcm8gYml0cyBmb2xsb3dpbmcgdGhlIGxvd2VzdC1vcmRlciAoXCJyaWdodG1vc3RcIilcbiAqICAgICBvbmUtYml0IGluIHRoZSB0d28ncyBjb21wbGVtZW50IGJpbmFyeSByZXByZXNlbnRhdGlvbiBvZiB0aGVcbiAqICAgICBzcGVjaWZpZWQge0Bjb2RlIGludH0gdmFsdWUsIG9yIDMyIGlmIHRoZSB2YWx1ZSBpcyBlcXVhbFxuICogICAgIHRvIHplcm8uXG4gKiBAc2luY2UgMS41XG4gKi9cbkludGVnZXIubnVtYmVyT2ZUcmFpbGluZ1plcm9zID0gZnVuY3Rpb24gKGkpIHtcbiAgLy8gSEQsIEZpZ3VyZSA1LTE0XG4gIHZhciB5O1xuICBpZiAoaSA9PSAwKSByZXR1cm4gMzI7XG4gIHZhciBuID0gMzE7XG4gIHkgPSBpIDw8MTY7IGlmICh5ICE9IDApIHsgbiA9IG4gLTE2OyBpID0geTsgfVxuICB5ID0gaSA8PCA4OyBpZiAoeSAhPSAwKSB7IG4gPSBuIC0gODsgaSA9IHk7IH1cbiAgeSA9IGkgPDwgNDsgaWYgKHkgIT0gMCkgeyBuID0gbiAtIDQ7IGkgPSB5OyB9XG4gIHkgPSBpIDw8IDI7IGlmICh5ICE9IDApIHsgbiA9IG4gLSAyOyBpID0geTsgfVxuICByZXR1cm4gbiAtICgoaSA8PCAxKSA+Pj4gMzEpO1xufVxuXG5JbnRlZ2VyLm51bWJlck9mTGVhZGluZ1plcm9zID0gZnVuY3Rpb24gKGkpIHtcbiAgLy8gSEQsIEZpZ3VyZSA1LTZcbiAgaWYgKGkgPT0gMClcbiAgICByZXR1cm4gMzI7XG4gIFxuICB2YXIgbiA9IDE7XG4gIGlmIChpID4+PiAxNiA9PSAwKSB7IG4gKz0gMTY7IGkgPDw9IDE2OyB9XG4gIGlmIChpID4+PiAyNCA9PSAwKSB7IG4gKz0gIDg7IGkgPDw9ICA4OyB9XG4gIGlmIChpID4+PiAyOCA9PSAwKSB7IG4gKz0gIDQ7IGkgPDw9ICA0OyB9XG4gIGlmIChpID4+PiAzMCA9PSAwKSB7IG4gKz0gIDI7IGkgPDw9ICAyOyB9XG4gIG4gLT0gaSA+Pj4gMzE7XG5cbiAgcmV0dXJuIG47XG59XG5cbkludGVnZXIuYml0Q291bnQgPSBmdW5jdGlvbiAoaSkge1xuICAvLyBIRCwgRmlndXJlIDUtMlxuICBpID0gaSAtICgoaSA+Pj4gMSkgJiAweDU1NTU1NTU1KTtcbiAgaSA9IChpICYgMHgzMzMzMzMzMykgKyAoKGkgPj4+IDIpICYgMHgzMzMzMzMzMyk7XG4gIGkgPSAoaSArIChpID4+PiA0KSkgJiAweDBmMGYwZjBmO1xuICBpID0gaSArIChpID4+PiA4KTtcbiAgaSA9IGkgKyAoaSA+Pj4gMTYpO1xuICByZXR1cm4gaSAmIDB4M2Y7XG59XG5cbkludGVnZXIuTUlOX1ZBTFVFID0gMHg4MDAwMDAwMDtcblxuSW50ZWdlci5NQVhfVkFMVUUgPSAweDdmZmZmZmZmO1xuXG5JbnRlZ2VyLmRpZ2l0cyA9IFtcbiAgJzAnICwgJzEnICwgJzInICwgJzMnICwgJzQnICwgJzUnICxcbiAgJzYnICwgJzcnICwgJzgnICwgJzknICwgJ2EnICwgJ2InICxcbiAgJ2MnICwgJ2QnICwgJ2UnICwgJ2YnICwgJ2cnICwgJ2gnICxcbiAgJ2knICwgJ2onICwgJ2snICwgJ2wnICwgJ20nICwgJ24nICxcbiAgJ28nICwgJ3AnICwgJ3EnICwgJ3InICwgJ3MnICwgJ3QnICxcbiAgJ3UnICwgJ3YnICwgJ3cnICwgJ3gnICwgJ3knICwgJ3onXG5dXG5cbm1vZHVsZS5leHBvcnRzID0gSW50ZWdlcjsiLCJcbnZhciBJbnRlZ2VyID0gcmVxdWlyZSgnLi9JbnRlZ2VyJyk7XG52YXIgQmlnSW50ZWdlckxpYiA9IHJlcXVpcmUoJy4vQmlnSW50ZWdlckxpYicpO1xudmFyIExvbmcgPSByZXF1aXJlKCdsb25nJyk7XG52YXIgQ29tbW9uID0gcmVxdWlyZSgnLi9jb21tb24nKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5mdW5jdGlvbiBNdXRhYmxlQmlnSW50ZWdlcih2YWwpIHtcbiAgaWYgKHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgLy8gQHNlZSBNdXRhYmxlQmlnSW50ZWdlcigpXG4gICAgdGhpcy52YWx1ZSA9IFswXTtcbiAgICB0aGlzLmludExlbiA9IDA7XG4gIFxuICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsKSkge1xuICAgIC8vIEBzZWUgTXV0YWJsZUJpZ0ludGVnZXIoaW50W10gdmFsKVxuICAgIHRoaXMudmFsdWUgPSB2YWw7XG4gICAgdGhpcy5pbnRMZW4gPSB2YWwubGVuZ3RoO1xuICBcbiAgfSBlbHNlIGlmICh2YWwuY29uc3RydWN0b3IubmFtZSA9PT0gJ011dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIC8vIEBzZWUgIE11dGFibGVCaWdJbnRlZ2VyKE11dGFibGVCaWdJbnRlZ2VyIHZhbClcbiAgICB0aGlzLmludExlbiA9IHZhbC5pbnRMZW47XG4gICAgdGhpcy52YWx1ZSA9IENvbW1vbi5jb3B5T2ZSYW5nZSh2YWwudmFsdWUsIHZhbC5vZmZzZXQsIHZhbC5vZmZzZXQgKyB0aGlzLmludExlbik7XG4gIFxuICB9IGVsc2UgaWYgKHZhbC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnQmlnSW50ZWdlcicpIHtcbiAgICAvLyBAc2VlIHB1YmxpYyBzdGF0aWMgaW50W10gY29weU9mKGludFtdIG9yaWdpbmFsLCBpbnQgbmV3TGVuZ3RoKVxuICAgIHRoaXMuaW50TGVuID0gdmFsLm1hZy5sZW5ndGg7XG4gICAgdGhpcy52YWx1ZSA9IENvbW1vbi5jb3B5T2YodmFsLm1hZywgdGhpcy5pbnRMZW4pO1xuXG4gIH0gZWxzZSBpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBAc2VlIE11dGFibGVCaWdJbnRlZ2VyKGludCB2YWwpIFxuICAgIHRoaXMudmFsdWUgPSBbMF07XG4gICAgdGhpcy5pbnRMZW4gPSAwO1xuICAgIHRoaXMudmFsdWVbMF0gPSB2YWw7XG4gIFxuICB9IGVsc2Uge1xuICAgIC8vIEBzZWUgTXV0YWJsZUJpZ0ludGVnZXIoKVxuICAgIHRoaXMudmFsdWUgPSBbMF07XG4gICAgdGhpcy5pbnRMZW4gPSAwO1xuICBcbiAgfVxuICAgdGhpcy5vZmZzZXQgPSAwO1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHF1b3RpZW50IG9mIHRoaXMgZGl2IGIgYW5kIHBsYWNlcyB0aGUgcXVvdGllbnQgaW4gdGhlXG4gKiBwcm92aWRlZCBNdXRhYmxlQmlnSW50ZWdlciBvYmplY3RzIGFuZCB0aGUgcmVtYWluZGVyIG9iamVjdCBpcyByZXR1cm5lZC5cbiAqXG4gKiBVc2VzIEFsZ29yaXRobSBEIGluIEtudXRoIHNlY3Rpb24gNC4zLjEuXG4gKiBNYW55IG9wdGltaXphdGlvbnMgdG8gdGhhdCBhbGdvcml0aG0gaGF2ZSBiZWVuIGFkYXB0ZWQgZnJvbSB0aGUgQ29saW5cbiAqIFBsdW1iIEMgbGlicmFyeS5cbiAqIEl0IHNwZWNpYWwgY2FzZXMgb25lIHdvcmQgZGl2aXNvcnMgZm9yIHNwZWVkLiBUaGUgY29udGVudCBvZiBiIGlzIG5vdFxuICogY2hhbmdlZC5cbiAqXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5kaXZpZGUgPSBmdW5jdGlvbiAoYiwgcXVvdGllbnQpIHtcbiAgaWYgKGIuaW50TGVuID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQmlnSW50ZWdlclRlc3QgZGl2aWRlIGJ5IHplcm9cIik7XG4gIH1cbiAgLy8gRGl2aWRlbmQgaXMgemVyb1xuICBpZiAodGhpcy5pbnRMZW4gPT0gMCkge1xuICAgIHF1b3RpZW50LmludExlbiA9IHF1b3RpZW50Lm9mZnNldDtcbiAgICByZXR1cm4gbmV3IE11dGFibGVCaWdJbnRlZ2VyKCk7XG4gIH1cblxuICB2YXIgY21wID0gdGhpcy5jb21wYXJlKGIpO1xuICAvLyBEaXZpZGVuZCBsZXNzIHRoYW4gZGl2aXNvclxuICBpZiAoY21wIDwgMCkge1xuICAgIHF1b3RpZW50LmludExlbiA9IHF1b3RpZW50Lm9mZnNldCA9IDA7XG4gICAgcmV0dXJuIG5ldyBNdXRhYmxlQmlnSW50ZWdlcih0aGlzKTtcbiAgfVxuICAvLyBEaXZpZGVuZCBlcXVhbCB0byBkaXZpc29yXG4gIGlmIChjbXAgPT09IDApIHtcbiAgICBxdW90aWVudC52YWx1ZVswXSA9IHF1b3RpZW50LmludExlbiA9IDE7XG4gICAgcXVvdGllbnQub2Zmc2V0ID0gMDtcbiAgICByZXR1cm4gbmV3IE11dGFibGVCaWdJbnRlZ2VyKCk7XG4gIH1cblxuICBxdW90aWVudC5jbGVhcigpO1xuICAvLyBTcGVjaWFsIGNhc2Ugb25lIHdvcmQgZGl2aXNvclxuICBpZiAoYi5pbnRMZW4gPT09IDEpIHtcbiAgICB2YXIgciA9IHRoaXMuZGl2aWRlT25lV29yZChiLnZhbHVlW2Iub2Zmc2V0XSwgcXVvdGllbnQpO1xuICAgIGlmIChyID09PSAwKVxuICAgICAgcmV0dXJuIG5ldyBNdXRhYmxlQmlnSW50ZWdlcigpO1xuICAgIHJldHVybiBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoW3JdKTtcbiAgfVxuXG4gIC8vIENvcHkgZGl2aXNvciB2YWx1ZSB0byBwcm90ZWN0IGRpdmlzb3JcbiAgdmFyIGRpdiA9IENvbW1vbi5jb3B5T2ZSYW5nZShiLnZhbHVlLCBiLm9mZnNldCwgYi5vZmZzZXQgKyBiLmludExlbik7XG4gIHJldHVybiB0aGlzLmRpdmlkZU1hZ25pdHVkZShkaXYsIHF1b3RpZW50KTtcbn1cblxuLyoqXG4gKiBEaXZpZGUgdGhpcyBNdXRhYmxlQmlnSW50ZWdlciBieSB0aGUgZGl2aXNvciByZXByZXNlbnRlZCBieSBpdHMgbWFnbml0dWRlXG4gKiBhcnJheS4gVGhlIHF1b3RpZW50IHdpbGwgYmUgcGxhY2VkIGludG8gdGhlIHByb3ZpZGVkIHF1b3RpZW50IG9iamVjdCAmXG4gKiB0aGUgcmVtYWluZGVyIG9iamVjdCBpcyByZXR1cm5lZC5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmRpdmlkZU1hZ25pdHVkZSA9IGZ1bmN0aW9uIChkaXZpc29yLCBxdW90aWVudCkge1xuICAvLyBSZW1haW5kZXIgc3RhcnRzIGFzIGRpdmlkZW5kIHdpdGggc3BhY2UgZm9yIGEgbGVhZGluZyB6ZXJvXG4gIHZhciByZW0gPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoQ29tbW9uLmludEFycmF5KHRoaXMuaW50TGVuICsgMSkpO1xuICBDb21tb24uYXJyYXljb3B5KHRoaXMudmFsdWUsIHRoaXMub2Zmc2V0LCByZW0udmFsdWUsIDEsIHRoaXMuaW50TGVuKTtcbiAgcmVtLmludExlbiA9IHRoaXMuaW50TGVuO1xuICByZW0ub2Zmc2V0ID0gMTtcbiAgXG4gIHZhciBubGVuID0gcmVtLmludExlbjtcblxuICAvLyBTZXQgdGhlIHF1b3RpZW50IHNpemVcbiAgdmFyIGRsZW4gPSBkaXZpc29yLmxlbmd0aDtcbiAgdmFyIGxpbWl0ID0gbmxlbiAtIGRsZW4gKyAxO1xuICBpZiAocXVvdGllbnQudmFsdWUubGVuZ3RoIDwgbGltaXQpIHtcbiAgICBxdW90aWVudC52YWx1ZSA9ICBDb21tb24uaW50QXJyYXkobGltaXQpO1xuICAgIHF1b3RpZW50Lm9mZnNldCA9IDA7XG4gIH1cbiAgcXVvdGllbnQuaW50TGVuID0gbGltaXQ7XG4gIC8vIGludFtdXG4gIHZhciBxID0gcXVvdGllbnQudmFsdWU7XG5cbiAgLy8gRDEgbm9ybWFsaXplIHRoZSBkaXZpc29yXG4gIHZhciBzaGlmdCA9IEludGVnZXIubnVtYmVyT2ZMZWFkaW5nWmVyb3MoZGl2aXNvclswXSk7XG4gIGlmIChzaGlmdCA+IDApIHtcbiAgICAgIC8vIEZpcnN0IHNoaWZ0IHdpbGwgbm90IGdyb3cgYXJyYXlcbiAgICAgIEJpZ0ludGVnZXJMaWIucHJpbWl0aXZlTGVmdFNoaWZ0KGRpdmlzb3IsIGRsZW4sIHNoaWZ0KTtcbiAgICAgIC8vIEJ1dCB0aGlzIG9uZSBtaWdodFxuICAgICAgcmVtLmxlZnRTaGlmdChzaGlmdCk7XG4gIH1cblxuICAvLyBNdXN0IGluc2VydCBsZWFkaW5nIDAgaW4gcmVtIGlmIGl0cyBsZW5ndGggZGlkIG5vdCBjaGFuZ2VcbiAgaWYgKHJlbS5pbnRMZW4gPT0gbmxlbikge1xuICAgIHJlbS5vZmZzZXQgPSAwO1xuICAgIHJlbS52YWx1ZVswXSA9IDA7XG4gICAgcmVtLmludExlbisrO1xuICB9XG5cbiAgdmFyIGRoID0gZGl2aXNvclswXTtcbiAgdmFyIGRoTG9uZyA9IExvbmcuZnJvbU51bWJlcihkaCA+Pj4gMzIpO1xuICB2YXIgZGwgPSBkaXZpc29yWzFdO1xuICB2YXIgcVdvcmQgPSBbMCwgMF07XG4gIFxuICAvLyBEMiBJbml0aWFsaXplIGpcbiAgZm9yKHZhciBqID0gMDsgaiA8IGxpbWl0OyBqKyspIHtcbiAgICAvLyBEMyBDYWxjdWxhdGUgcWhhdFxuICAgIC8vIGVzdGltYXRlIHFoYXRcbiAgICB2YXIgcWhhdCA9IDA7XG4gICAgdmFyIHFyZW0gPSAwO1xuICAgIHZhciBza2lwQ29ycmVjdGlvbiA9IGZhbHNlO1xuICAgIHZhciBuaCA9IHJlbS52YWx1ZVtqICsgcmVtLm9mZnNldF07XG4gICAgdmFyIG5oMiA9IExvbmcuZnJvbU51bWJlcihuaCkuYWRkKExvbmcuZnJvbU51bWJlcigweDgwMDAwMDAwKSkubG93O1xuICAgIHZhciBubSA9IHJlbS52YWx1ZVtqICsgMSArIHJlbS5vZmZzZXRdO1xuXG4gICAgaWYgKG5oID09PSBkaCkge1xuICAgICAgcWhhdCA9IH4wO1xuICAgICAgcXJlbSA9IG5oICsgbm07XG4gICAgICBza2lwQ29ycmVjdGlvbiA9IExvbmcuZnJvbU51bWJlcihxcmVtKS5hZGQoTG9uZy5mcm9tTnVtYmVyKDB4ODAwMDAwMDApKS5sb3cgPCBuaDI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBuQ2h1bmsgPSBMb25nLmZyb21OdW1iZXIobmgpLnNoaWZ0TGVmdCgzMikub3IoTG9uZy5mcm9tTnVtYmVyKG5tID4+PiAzMikpO1xuICAgICAgaWYgKG5DaHVuayA+PSAwKSB7XG4gICAgICAgIHFoYXQgPSBuQ2h1bmsuZGl2KGRoTG9uZykubG93O1xuICAgICAgICBxcmVtID0gbkNodW5rLnN1YnRyYWN0KExvbmcuZnJvbU51bWJlcihxaGF0KS5tdWx0aXBseShkaExvbmcpKS5sb3c7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmRpdldvcmQocVdvcmQsIG5DaHVuaywgZGgpO1xuICAgICAgICBxaGF0ID0gcVdvcmRbMF07XG4gICAgICAgIHFyZW0gPSBxV29yZFsxXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocWhhdCA9PSAwKVxuICAgICAgY29udGludWU7XG5cbiAgICBpZiAoIXNraXBDb3JyZWN0aW9uKSB7IC8vIENvcnJlY3QgcWhhdFxuICAgICAgdmFyIG5sID0gTG9uZy5mcm9tTnVtYmVyKHJlbS52YWx1ZVtqICsgMiArIHJlbS5vZmZzZXRdID4+PiAzMik7XG4gICAgICB2YXIgcnMgPSBMb25nLmZyb21OdW1iZXIocXJlbSA+Pj4gMzIpLnNoaWZ0TGVmdCgzMikub3IobmwpO1xuICAgICAgdmFyIGVzdFByb2R1Y3QgPSBMb25nLmZyb21OdW1iZXIoZGwgPj4+IDMyKS5tdWx0aXBseShMb25nLmZyb21OdW1iZXIocWhhdCA+Pj4gMzIpKTtcblxuICAgICAgaWYgKHRoaXMudW5zaWduZWRMb25nQ29tcGFyZShlc3RQcm9kdWN0LCBycykpIHtcbiAgICAgICAgcWhhdC0tO1xuICAgICAgICB2YXIgcXJlbSA9IExvbmcuZnJvbU51bWJlcihxcmVtID4+PiAzMikuYWRkKGRoTG9uZykubG93O1xuICAgICAgICBpZiAoTG9uZy5mcm9tTnVtYmVyKHFyZW0gPj4+IDMyKS5jb21wYXJlKGRoTG9uZykgPj0gMCkge1xuICAgICAgICAgIGVzdFByb2R1Y3QgPSBlc3RQcm9kdWN0LnN1YnRyYWN0KExvbmcuZnJvbU51bWJlcihkbCA+Pj4gMzIpKTtcbiAgICAgICAgICBycyA9IExvbmcuZnJvbU51bWJlcihxcmVtID4+PiAzMikuc2hpZnRMZWZ0KDMyKS5vcihubCk7XG4gICAgICAgICAgaWYgKHRoaXMudW5zaWduZWRMb25nQ29tcGFyZShlc3RQcm9kdWN0LCBycykpIHtcbiAgICAgICAgICAgIHFoYXQtLTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEQ0IE11bHRpcGx5IGFuZCBzdWJ0cmFjdFxuICAgIHJlbS52YWx1ZVtqICsgcmVtLm9mZnNldF0gPSAwO1xuICAgIFxuICAgIHZhciBib3Jyb3cgPSB0aGlzLm11bHN1YihyZW0udmFsdWUsIGRpdmlzb3IsIHFoYXQsIGRsZW4sIGogKyByZW0ub2Zmc2V0KTtcblxuICAgIC8vIEQ1IFRlc3QgcmVtYWluZGVyXG4gICAgaWYgKExvbmcuZnJvbU51bWJlcihib3Jyb3cpLmFkZChMb25nLmZyb21OdW1iZXIoMHg4MDAwMDAwMCkpLmxvdyA+IG5oMikge1xuICAgICAgLy8gRDYgQWRkIGJhY2tcbiAgICAgIHRoaXMuZGl2YWRkKGRpdmlzb3IsIHJlbS52YWx1ZSwgaisxK3JlbS5vZmZzZXQpO1xuICAgICAgcWhhdC0tO1xuICAgIH1cblxuICAgIC8vIC8vIFN0b3JlIHRoZSBxdW90aWVudCBkaWdpdFxuICAgIHFbal0gPSBxaGF0O1xuICB9IC8vIEQ3IGxvb3Agb24galxuXG4gIC8vIEQ4IFVubm9ybWFsaXplXG4gIGlmIChzaGlmdCA+IDApXG4gICAgcmVtLnJpZ2h0U2hpZnQoc2hpZnQpO1xuXG4gIHF1b3RpZW50Lm5vcm1hbGl6ZSgpO1xuICByZW0ubm9ybWFsaXplKCk7XG4gIHJldHVybiByZW07XG59XG5cbi8qKlxuKiBBIHByaW1pdGl2ZSB1c2VkIGZvciBkaXZpc2lvbi4gVGhpcyBtZXRob2QgYWRkcyBpbiBvbmUgbXVsdGlwbGUgb2YgdGhlXG4qIGRpdmlzb3IgYSBiYWNrIHRvIHRoZSBkaXZpZGVuZCByZXN1bHQgYXQgYSBzcGVjaWZpZWQgb2Zmc2V0LiBJdCBpcyB1c2VkXG4qIHdoZW4gcWhhdCB3YXMgZXN0aW1hdGVkIHRvbyBsYXJnZSwgYW5kIG11c3QgYmUgYWRqdXN0ZWQuXG4qIGludFtdIGEsIGludFtdIHJlc3VsdCwgaW50IG9mZnNldFxuKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5kaXZhZGQgPSBmdW5jdGlvbiAoYSwgcmVzdWx0LCBvZmZzZXQpIHtcbiAgdmFyIGNhcnJ5ID0gTG9uZy5mcm9tSW50KDApO1xuICBmb3IgKHZhciBqID0gYS5sZW5ndGgtMTsgaiA+PSAwOyBqLS0pIHtcbiAgICB2YXIgc3VtID0gTG9uZy5mcm9tTnVtYmVyKGFbal0gPj4+IDMyKS5hZGQoTG9uZy5mcm9tTnVtYmVyKHJlc3VsdFtqICsgb2Zmc2V0XSA+Pj4gMzIpKS5hZGQoY2FycnkpO1xuICAgIHJlc3VsdFtqK29mZnNldF0gPSBzdW0ubG93O1xuICAgIGNhcnJ5ID0gc3VtLnNoaWZ0UmlnaHRVbnNpZ25lZCgzMik7XG4gIH1cbiAgcmV0dXJuIGNhcnJ5Lmxvdztcbn1cblxuLyoqXG4gKiBFbnN1cmUgdGhhdCB0aGUgTXV0YWJsZUJpZ0ludGVnZXIgaXMgaW4gbm9ybWFsIGZvcm0sIHNwZWNpZmljYWxseVxuICogbWFraW5nIHN1cmUgdGhhdCB0aGVyZSBhcmUgbm8gbGVhZGluZyB6ZXJvcywgYW5kIHRoYXQgaWYgdGhlXG4gKiBtYWduaXR1ZGUgaXMgemVybywgdGhlbiBpbnRMZW4gaXMgemVyby5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaW50TGVuID09PSAwKSB7XG4gICAgdGhpcy5vZmZzZXQgPSAwO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBpbmRleCA9IHRoaXMub2Zmc2V0O1xuICBpZiAodGhpcy52YWx1ZVtpbmRleF0gIT0gMClcbiAgICByZXR1cm47XG5cbiAgdmFyIGluZGV4Qm91bmQgPSBpbmRleCArIHRoaXMuaW50TGVuO1xuICBkbyB7XG4gICAgaW5kZXgrKztcbiAgfSB3aGlsZSgoaW5kZXggPCBpbmRleEJvdW5kKSAmJiAodGhpcy52YWx1ZVtpbmRleF0gPT09IDApKTtcbiAgdmFyIG51bVplcm9zID0gaW5kZXggLSB0aGlzLm9mZnNldDtcbiAgdGhpcy5pbnRMZW4gLT0gbnVtWmVyb3M7XG4gIHRoaXMub2Zmc2V0ID0gKHRoaXMuaW50TGVuID09PSAwID8gIDAgOiB0aGlzLm9mZnNldCArIG51bVplcm9zKTtcbn1cblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBpcyB1c2VkIGZvciBkaXZpc2lvbi4gSXQgbXVsdGlwbGllcyBhbiBuIHdvcmQgaW5wdXQgYSBieSBvbmVcbiAqIHdvcmQgaW5wdXQgeCwgYW5kIHN1YnRyYWN0cyB0aGUgbiB3b3JkIHByb2R1Y3QgZnJvbSBxLiBUaGlzIGlzIG5lZWRlZFxuICogd2hlbiBzdWJ0cmFjdGluZyBxaGF0KmRpdmlzb3IgZnJvbSBkaXZpZGVuZC5cbiAqIGludFtdIHEsIGludFtdIGEsIGludCB4LCBpbnQgbGVuLCBpbnQgb2Zmc2V0XG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5tdWxzdWIgPSBmdW5jdGlvbiAocSwgYSwgeCwgbGVuLCBvZmZzZXQpIHtcbiAgdmFyIHhMb25nID0gTG9uZy5mcm9tTnVtYmVyKHggPj4+IDMyKTtcbiAgdmFyIGNhcnJ5ID0gTG9uZy5mcm9tTnVtYmVyKDApO1xuICBvZmZzZXQgKz0gbGVuO1xuICBmb3IgKHZhciBqID0gbGVuIC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICB2YXIgcHJvZHVjdCA9IExvbmcuZnJvbU51bWJlcihhW2pdID4+PiAzMikubXVsdGlwbHkoeExvbmcpLmFkZChjYXJyeSk7XG4gICAgdmFyIGRpZmZlcmVuY2UgPSBMb25nLmZyb21OdW1iZXIocVtvZmZzZXRdKS5zdWJ0cmFjdChwcm9kdWN0KTtcbiAgICBxW29mZnNldC0tXSA9IGRpZmZlcmVuY2UubG93O1xuICAgIGNhcnJ5ID0gcHJvZHVjdC5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpLmFkZCggXG4gICAgICBMb25nLmZyb21OdW1iZXIoZGlmZmVyZW5jZS5sb3cgPj4+MzIpLmNvbXBhcmUoTG9uZy5mcm9tTnVtYmVyKH5wcm9kdWN0LmxvdyA+Pj4gMzIpKSA+IDAgPyBMb25nLmZyb21JbnQoMSkgOiBMb25nLmZyb21JbnQoMClcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIGNhcnJ5Lmxvdztcbn1cblxuLyoqXG4gKiBDb21wYXJlIHR3byBsb25ncyBhcyBpZiB0aGV5IHdlcmUgdW5zaWduZWQuXG4gKiBSZXR1cm5zIHRydWUgaWZmIG9uZSBpcyBiaWdnZXIgdGhhbiB0d28uXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS51bnNpZ25lZExvbmdDb21wYXJlID0gZnVuY3Rpb24gKG9uZSwgdHdvKSB7XG4gIHJldHVybiBvbmUuYWRkKExvbmcuTUlOX1ZBTFVFKS5jb21wYXJlKHR3by5hZGQoTG9uZy5NSU5fVkFMVUUpKSA+IDA7XG59XG5cbi8qKlxuICogW2RpdldvcmQgZGVzY3JpcHRpb25dXG4gKiBAcGFyYW0gIHtpbnRbXSB9IHJlc3VsdCBbZGVzY3JpcHRpb25dXG4gKiBAcGFyYW0gIHtsb25nfSBuICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cbiAqIEBwYXJhbSAge2ludH0gICAgIGQgICAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgW2Rlc2NyaXB0aW9uXVxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuZGl2V29yZCA9IGZ1bmN0aW9uIChyZXN1bHQsIG4sIGQpIHtcbiAgLy8gaWYgKHR5cGVvZiBuID09PSAnbnVtYmVyJykge1xuICAvLyAgIG4gPSBMb25nLmZyb21OdW1iZXIobik7XG4gIC8vIH1cbiAgLy8gbG9uZ1xuICB2YXIgZExvbmcgPSBMb25nLmZyb21OdW1iZXIoZCA+Pj4gMzIpO1xuXG4gIGlmIChkTG9uZy50b051bWJlcigpID09PSAxKSB7XG4gICAgcmVzdWx0WzBdID0gbi5sb3c7XG4gICAgcmVzdWx0WzFdID0gMDtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBcHByb3hpbWF0ZSB0aGUgcXVvdGllbnQgYW5kIHJlbWFpbmRlclxuICAvLyB2YXIgcSA9IChuID4+PiAxKSAvIChkTG9uZyA+Pj4gMSk7XG4gIHZhciBxID0gbi5zaGlmdFJpZ2h0VW5zaWduZWQoMSkuZGl2KGRMb25nLnNoaWZ0UmlnaHRVbnNpZ25lZCgxKSk7XG5cbiAgLy8gdmFyIHIgPSBuIC0gcSAqIGRMb25nO1xuICB2YXIgciA9IG4uc3VidHJhY3QocS5tdWx0aXBseShkTG9uZykpO1xuICB2YXIgemVybyA9IExvbmcuZnJvbUludCgwKTtcbiAgLy8gQ29ycmVjdCB0aGUgYXBwcm94aW1hdGlvblxuICB3aGlsZSAoci5jb21wYXJlKHplcm8pIDwgMCkge1xuICAgIC8vIHIgKz0gZExvbmc7XG4gICAgciA9IHIuYWRkKGRMb25nKTtcbiAgICAvLyBxLS07XG4gICAgcSA9IHEuc3VidHJhY3QoTG9uZy5mcm9tSW50KDEpKTtcbiAgfVxuICB3aGlsZSAoci5jb21wYXJlKGRMb25nKSA+PSAwKSB7XG4gICAgLy8gciAtPSBkTG9uZztcbiAgICAvLyBxKys7XG4gICAgciA9IHIuc3VidHJhY3QoZExvbmcpO1xuICAgIHEgPSBxLmFkZCgxKTtcbiAgfVxuXG4gIHJlc3VsdFswXSA9IHEubG93O1xuICByZXN1bHRbMV0gPSByLmxvdztcbn1cblxuLyoqXG4gKiBbcHJpbWl0aXZlTGVmdFNoaWZ0IGRlc2NyaXB0aW9uXVxuICogQHBhcmFtICB7aW50W119ICBhICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cbiAqIEBwYXJhbSAge2ludH0gIGxlbiAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuICogQHBhcmFtICB7aW50fSAgbiAgICAgICAgICAgICBbZGVzY3JpcHRpb25dXG4gKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgIFtkZXNjcmlwdGlvbl1cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLnByaW1pdGl2ZUxlZnRTaGlmdCA9IGZ1bmN0aW9uIChuKSB7XG4gIHZhciB2YWwgPSB0aGlzLnZhbHVlO1xuICB2YXIgbjIgPSAzMiAtIG47XG4gIGZvciAodmFyIGkgPSB0aGlzLm9mZnNldCwgYyA9IHZhbFtpXSwgbSA9IGkgKyB0aGlzLmludExlbiAtIDE7IGkgPCBtOyBpKyspIHtcbiAgICB2YXIgYiA9IGM7XG4gICAgYyA9IHZhbFtpICsgMV07XG4gICAgdmFsW2ldID0gKGIgPDwgbikgfCAoYyA+Pj4gbjIpO1xuICB9XG4gIHZhbFt0aGlzLm9mZnNldCArIHRoaXMuaW50TGVuIC0gMV0gPDw9IG47XG59XG5cbi8qKlxuICogUmlnaHQgc2hpZnQgdGhpcyBNdXRhYmxlQmlnSW50ZWdlciBuIGJpdHMsIHdoZXJlIG4gaXNcbiAqIGxlc3MgdGhhbiAzMi5cbiAqIEFzc3VtZXMgdGhhdCBpbnRMZW4gPiAwLCBuID4gMCBmb3Igc3BlZWRcbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLnByaW1pdGl2ZVJpZ2h0U2hpZnQgPSBmdW5jdGlvbiAobikge1xuICB2YXIgdmFsID0gdGhpcy52YWx1ZTtcbiAgdmFyIG4yID0gMzIgLSBuO1xuICBmb3IgKHZhciBpID0gdGhpcy5vZmZzZXQgKyB0aGlzLmludExlbiAtIDEsIGMgPSB2YWxbaV07IGkgPiB0aGlzLm9mZnNldDsgaS0tKSB7XG4gICAgdmFyIGIgPSBjO1xuICAgIGMgPSB2YWxbaS0xXTtcbiAgICB2YWxbaV0gPSAoYyA8PCBuMikgfCAoYiA+Pj4gbik7XG4gIH1cbiAgdmFsW3RoaXMub2Zmc2V0XSA+Pj49IG47XG59XG5cbi8qKlxuICogTGVmdCBzaGlmdCB0aGlzIE11dGFibGVCaWdJbnRlZ2VyIG4gYml0cy5cbiAqIGludCBcbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmxlZnRTaGlmdCA9IGZ1bmN0aW9uIChuKSB7XG4gIC8qXG4gICAqIElmIHRoZXJlIGlzIGVub3VnaCBzdG9yYWdlIHNwYWNlIGluIHRoaXMgTXV0YWJsZUJpZ0ludGVnZXIgYWxyZWFkeVxuICAgKiB0aGUgYXZhaWxhYmxlIHNwYWNlIHdpbGwgYmUgdXNlZC4gU3BhY2UgdG8gdGhlIHJpZ2h0IG9mIHRoZSB1c2VkXG4gICAqIGludHMgaW4gdGhlIHZhbHVlIGFycmF5IGlzIGZhc3RlciB0byB1dGlsaXplLCBzbyB0aGUgZXh0cmEgc3BhY2VcbiAgICogd2lsbCBiZSB0YWtlbiBmcm9tIHRoZSByaWdodCBpZiBwb3NzaWJsZS5cbiAgICovXG4gIGlmICh0aGlzLmludExlbiA9PSAwKVxuICAgICByZXR1cm47XG4gIHZhciBuSW50cyA9IG4gPj4+IDU7XG4gIHZhciBuQml0cyA9IG4gJiAweDFGO1xuICB2YXIgYml0c0luSGlnaFdvcmQgPSBCaWdJbnRlZ2VyTGliLmJpdExlbmd0aEZvckludCh0aGlzLnZhbHVlW3RoaXMub2Zmc2V0XSk7XG5cbiAgLy8gSWYgc2hpZnQgY2FuIGJlIGRvbmUgd2l0aG91dCBtb3Zpbmcgd29yZHMsIGRvIHNvXG4gIGlmIChuIDw9ICgzMiAtIGJpdHNJbkhpZ2hXb3JkKSkge1xuICAgIHRoaXMucHJpbWl0aXZlTGVmdFNoaWZ0KG5CaXRzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgbmV3TGVuID0gdGhpcy5pbnRMZW4gKyBuSW50cyArMTtcbiAgaWYgKG5CaXRzIDw9ICgzMiAtIGJpdHNJbkhpZ2hXb3JkKSlcbiAgICBuZXdMZW4tLTtcbiAgaWYgKHRoaXMudmFsdWUubGVuZ3RoIDwgbmV3TGVuKSB7XG4gICAgLy8gVGhlIGFycmF5IG11c3QgZ3Jvd1xuICAgIHZhciByZXN1bHQgPSAgQ29tbW9uLmludEFycmF5KG5ld0xlbik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmludExlbjsgaSsrKVxuICAgICAgcmVzdWx0W2ldID0gdGhpcy52YWx1ZVt0aGlzLm9mZnNldCtpXTtcbiAgICB0aGlzLnNldFZhbHVlKHJlc3VsdCwgbmV3TGVuKTtcbiAgfSBlbHNlIGlmICh0aGlzLnZhbHVlLmxlbmd0aCAtIHRoaXMub2Zmc2V0ID49IG5ld0xlbikge1xuICAgIC8vIFVzZSBzcGFjZSBvbiByaWdodFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBuZXdMZW4gLSB0aGlzLmludExlbjsgaSsrKVxuICAgICAgdGhpcy52YWx1ZVt0aGlzLm9mZnNldCArIHRoaXMuaW50TGVuICsgaV0gPSAwO1xuICB9IGVsc2Uge1xuICAgIC8vIE11c3QgdXNlIHNwYWNlIG9uIGxlZnRcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuaW50TGVuOyBpKyspXG4gICAgICB0aGlzLnZhbHVlW2ldID0gdGhpcy52YWx1ZVt0aGlzLm9mZnNldCtpXTtcbiAgICBmb3IgKHZhciBpID0gdGhpcy5pbnRMZW47IGkgPCBuZXdMZW47IGkrKylcbiAgICAgIHRoaXMudmFsdWVbaV0gPSAwO1xuICAgIHRoaXMub2Zmc2V0ID0gMDtcbiAgfVxuICB0aGlzLmludExlbiA9IG5ld0xlbjtcbiAgaWYgKG5CaXRzID09IDApXG4gICAgcmV0dXJuO1xuICBpZiAobkJpdHMgPD0gKDMyIC0gYml0c0luSGlnaFdvcmQpKVxuICAgIHRoaXMucHJpbWl0aXZlTGVmdFNoaWZ0KG5CaXRzKTtcbiAgZWxzZVxuICAgIHRoaXMucHJpbWl0aXZlUmlnaHRTaGlmdCgzMiAtIG5CaXRzKTtcbn1cblxuLyoqXG4gKiBSaWdodCBzaGlmdCB0aGlzIE11dGFibGVCaWdJbnRlZ2VyIG4gYml0cy4gVGhlIE11dGFibGVCaWdJbnRlZ2VyIGlzIGxlZnRcbiAqIGluIG5vcm1hbCBmb3JtLlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUucmlnaHRTaGlmdCA9IGZ1bmN0aW9uIChuKSB7XG4gIGlmICh0aGlzLmludExlbiA9PT0gMClcbiAgICByZXR1cm47XG4gIHZhciBuSW50cyA9IG4gPj4+IDU7XG4gIHZhciBuQml0cyA9IG4gJiAweDFGO1xuICB0aGlzLmludExlbiAtPSBuSW50cztcbiAgaWYgKG5CaXRzID09IDApXG4gICAgcmV0dXJuO1xuICB2YXIgYml0c0luSGlnaFdvcmQgPSBCaWdJbnRlZ2VyTGliLmJpdExlbmd0aEZvckludCh0aGlzLnZhbHVlW3RoaXMub2Zmc2V0XSk7XG4gIGlmIChuQml0cyA+PSBiaXRzSW5IaWdoV29yZCkge1xuICAgIHRoaXMucHJpbWl0aXZlTGVmdFNoaWZ0KDMyIC0gbkJpdHMpO1xuICAgIHRoaXMuaW50TGVuLS07XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wcmltaXRpdmVSaWdodFNoaWZ0KG5CaXRzKTtcbiAgfVxufVxuXG4vKipcbiAqIFNldHMgdGhpcyBNdXRhYmxlQmlnSW50ZWdlcidzIHZhbHVlIGFycmF5IHRvIHRoZSBzcGVjaWZpZWQgYXJyYXkuXG4gKiBUaGUgaW50TGVuIGlzIHNldCB0byB0aGUgc3BlY2lmaWVkIGxlbmd0aC5cbiAqIGludFtdIFxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuc2V0VmFsdWUgPSBmdW5jdGlvbiAodmFsLCBsZW5ndGgpIHtcbiAgdGhpcy52YWx1ZSA9IHZhbDtcbiAgdGhpcy5pbnRMZW4gPSBsZW5ndGg7XG4gIHRoaXMub2Zmc2V0ID0gMDtcbn1cblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBpcyB1c2VkIGZvciBkaXZpc2lvbiBvZiBhbiBuIHdvcmQgZGl2aWRlbmQgYnkgYSBvbmUgd29yZFxuICogZGl2aXNvci4gVGhlIHF1b3RpZW50IGlzIHBsYWNlZCBpbnRvIHF1b3RpZW50LiBUaGUgb25lIHdvcmQgZGl2aXNvciBpc1xuICogc3BlY2lmaWVkIGJ5IGRpdmlzb3IuXG4gKlxuICogQHJldHVybiB0aGUgcmVtYWluZGVyIG9mIHRoZSBkaXZpc2lvbiBpcyByZXR1cm5lZC5cbiAqXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5kaXZpZGVPbmVXb3JkID0gZnVuY3Rpb24gKGRpdmlzb3IsIHF1b3RpZW50KSB7XG4gIHZhciBkaXZpc29yTG9uZyA9IExvbmcuZnJvbU51bWJlcihkaXZpc29yID4+PiAzMik7XG4gIC8vIFNwZWNpYWwgY2FzZSBvZiBvbmUgd29yZCBkaXZpZGVuZFxuICBpZiAodGhpcy5pbnRMZW4gPT09IDEpIHtcbiAgICB2YXIgZGl2aWRlbmRWYWx1ZSA9IExvbmcuZnJvbU51bWJlcih0aGlzLnZhbHVlW3RoaXMub2Zmc2V0XSA+Pj4gMzIpO1xuICAgIHZhciBxID0gZGl2aWRlbmRWYWx1ZS5kaXYoZGl2aXNvckxvbmcpLmxvdztcbiAgICB2YXIgciA9IGRpdmlkZW5kVmFsdWUuc3VidHJhY3QoTG9uZy5mcm9tSW50KHEpLm11bHRpcGx5KGRpdmlzb3JMb25nKSkubG93O1xuICAgIHF1b3RpZW50LnZhbHVlWzBdID0gcTtcbiAgICBxdW90aWVudC5pbnRMZW4gPSAocSA9PSAwKSA/IDAgOiAxO1xuICAgIHF1b3RpZW50Lm9mZnNldCA9IDA7XG4gICAgcmV0dXJuIHI7XG4gIH1cblxuICBpZiAocXVvdGllbnQudmFsdWUubGVuZ3RoIDwgdGhpcy5pbnRMZW4pe1xuICAgIHF1b3RpZW50LnZhbHVlID0gQ29tbW9uLmludEFycmF5KHRoaXMuaW50TGVuKTtcbiAgfVxuICBxdW90aWVudC5vZmZzZXQgPSAwO1xuICBxdW90aWVudC5pbnRMZW4gPSB0aGlzLmludExlbjtcblxuICAvLyBOb3JtYWxpemUgdGhlIGRpdmlzb3JcbiAgdmFyIHNoaWZ0ID0gSW50ZWdlci5udW1iZXJPZkxlYWRpbmdaZXJvcyhkaXZpc29yKTtcblxuICB2YXIgcmVtID0gdGhpcy52YWx1ZVt0aGlzLm9mZnNldF07XG4gIHZhciByZW1Mb25nID0gTG9uZy5mcm9tTnVtYmVyKHJlbSA+Pj4gMzIpO1xuICBpZiAocmVtTG9uZy5jb21wYXJlKGRpdmlzb3JMb25nKSA8IDApIHtcbiAgICBxdW90aWVudC52YWx1ZVswXSA9IDA7XG4gIH0gZWxzZSB7XG4gICAgcXVvdGllbnQudmFsdWVbMF0gPSByZW1Mb25nLmRpdihkaXZpc29yTG9uZykubG93O1xuICAgIHJlbSA9IHJlbUxvbmcuc3VidHJhY3QoTG9uZy5mcm9tSW50KHF1b3RpZW50LnZhbHVlWzBdKS5tdWx0aXBseShkaXZpc29yTG9uZykpLmxvdztcbiAgICByZW1Mb25nID0gTG9uZy5mcm9tTnVtYmVyKHJlbSA+Pj4gMzIpO1xuICB9XG5cbiAgdmFyIHhsZW4gPSB0aGlzLmludExlbjtcbiAgdmFyIHFXb3JkID0gQ29tbW9uLmludEFycmF5KDIpO1xuICB3aGlsZSAoLS14bGVuID4gMCkge1xuICAgICAgdmFyIGRpdmlkZW5kRXN0aW1hdGUgPSAocmVtTG9uZy5zaGlmdExlZnQoMzIpKS5vcihcbiAgICAgICAgICBMb25nLmZyb21OdW1iZXIodGhpcy52YWx1ZVt0aGlzLm9mZnNldCArIHRoaXMuaW50TGVuIC0geGxlbl0gPj4+IDMyKVxuICAgICAgICApO1xuICAgICAgaWYgKGRpdmlkZW5kRXN0aW1hdGUudG9OdW1iZXIoKSA+PSAwKSB7XG4gICAgICAgICAgcVdvcmRbMF0gPSBkaXZpZGVuZEVzdGltYXRlLmRpdihkaXZpc29yTG9uZykubG93O1xuICAgICAgICAgIHFXb3JkWzFdID0gZGl2aWRlbmRFc3RpbWF0ZS5zdWJ0cmFjdChMb25nLmZyb21JbnQocVdvcmRbMF0pLm11bHRpcGx5KGRpdmlzb3JMb25nKSkubG93O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmRpdldvcmQocVdvcmQsIGRpdmlkZW5kRXN0aW1hdGUsIGRpdmlzb3IpO1xuICAgICAgfVxuICAgICAgcXVvdGllbnQudmFsdWVbdGhpcy5pbnRMZW4gLSB4bGVuXSA9IHFXb3JkWzBdO1xuICAgICAgcmVtID0gcVdvcmRbMV07XG4gICAgICByZW1Mb25nID0gTG9uZy5mcm9tTnVtYmVyKHJlbSA+Pj4gMzIpO1xuICB9XG5cbiAgcXVvdGllbnQubm9ybWFsaXplKCk7XG4gIC8vIFVubm9ybWFsaXplXG4gIGlmIChzaGlmdCA+IDApXG4gICAgcmV0dXJuIHJlbSAlIGRpdmlzb3I7XG4gIGVsc2VcbiAgICByZXR1cm4gcmVtO1xufVxuXG4vKipcbiAqIENvbXBhcmUgdGhlIG1hZ25pdHVkZSBvZiB0d28gTXV0YWJsZUJpZ0ludGVnZXJzLiBSZXR1cm5zIC0xLCAwIG9yIDFcbiAqIGFzIHRoaXMgTXV0YWJsZUJpZ0ludGVnZXIgaXMgbnVtZXJpY2FsbHkgbGVzcyB0aGFuLCBlcXVhbCB0bywgb3JcbiAqIGdyZWF0ZXIgdGhhbiA8dHQ+YjwvdHQ+LlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uIChiKSB7XG4gIHZhciBibGVuID0gYi5pbnRMZW47XG4gIGlmICh0aGlzLmludExlbiA8IGJsZW4pXG4gICAgcmV0dXJuIC0xO1xuICBpZiAodGhpcy5pbnRMZW4gPiBibGVuKVxuICAgcmV0dXJuIDE7XG5cbiAgLy8gQWRkIEludGVnZXIuTUlOX1ZBTFVFIHRvIG1ha2UgdGhlIGNvbXBhcmlzb24gYWN0IGFzIHVuc2lnbmVkIGludGVnZXJcbiAgLy8gY29tcGFyaXNvbi5cbiAgdmFyIF94OCA9IExvbmcuZnJvbU51bWJlcigweDgwMDAwMDAwKTtcbiAgdmFyIGJ2YWwgPSBiLnZhbHVlO1xuICBmb3IgKHZhciBpID0gdGhpcy5vZmZzZXQsIGogPSBiLm9mZnNldDsgaSA8IHRoaXMuaW50TGVuICsgdGhpcy5vZmZzZXQ7IGkrKywgaisrKSB7XG4gICAgdmFyIGIxID0gTG9uZy5mcm9tTnVtYmVyKHRoaXMudmFsdWVbaV0pLmFkZChfeDgpLmxvdztcbiAgICB2YXIgYjIgPSBMb25nLmZyb21OdW1iZXIoYnZhbFtqXSkuYWRkKF94OCkubG93O1xuICAgIGlmIChiMSA8IGIyKVxuICAgICAgcmV0dXJuIC0xO1xuICAgIGlmIChiMSA+IGIyKVxuICAgICAgcmV0dXJuIDE7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbi8qKlxuICogQ2xlYXIgb3V0IGEgTXV0YWJsZUJpZ0ludGVnZXIgZm9yIHJldXNlLlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMub2Zmc2V0ID0gdGhpcy5pbnRMZW4gPSAwO1xuICBmb3IgKHZhciBpbmRleCA9IDAsIG4gPSB0aGlzLnZhbHVlLmxlbmd0aDsgaW5kZXggPCBuOyBpbmRleCsrKVxuICAgIHRoaXMudmFsdWVbaW5kZXhdID0gMDtcbn1cblxuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICB2YXIgdmFsID0gQ29tbW9uLmludEFycmF5KHRoaXMuaW50TGVuKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmludExlbjsgaSsrKSB7XG4gICAgdmFsW2ldID0gdGhpcy52YWx1ZVtpXTtcbiAgfVxuICByZXR1cm4gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHZhbCk7XG59XG5cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5nZXRNYWduaXR1ZGVBcnJheSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMub2Zmc2V0ID4gMCB8fCB0aGlzLnZhbHVlLmxlbmd0aCAhPSB0aGlzLmludExlbikge1xuICAgIHJldHVybiBDb21tb24uY29weU9mUmFuZ2UodGhpcy52YWx1ZSwgdGhpcy5vZmZzZXQsIHRoaXMub2Zmc2V0ICsgdGhpcy5pbnRMZW4pO1xuICB9XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufTtcblxuLy8gQHNlZSBCaWdJbnRlZ2VyLmZyb21NdXRhYmxlQmlnSW50ZWdlcihtYiwgc2lnbik7XG4vLyBNdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUudG9CaWdJbnRlZ2VyID0gZnVuY3Rpb24gKHNpZ24pIHtcbi8vICAgaWYgKHRoaXMuaW50TGVuID09IDAgfHwgc2lnbiA9PSAwKSB7XG4vLyAgICAgcmV0dXJuIEJpZ0ludGVnZXIuZnJvbU1hZyhbMF0sIDApO1xuLy8gICB9XG4vLyAgIHJldHVybiBCaWdJbnRlZ2VyLmZyb21NYWcodGhpcy5nZXRNYWduaXR1ZGVBcnJheSgpLCBzaWduKTtcbi8vIH1cblxuXG4vKlxuICogUmV0dXJucyB0aGUgbXVsdGlwbGljYXRpdmUgaW52ZXJzZSBvZiB2YWwgbW9kIDJeMzIuICBBc3N1bWVzIHZhbCBpcyBvZGQuXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLmludmVyc2VNb2QzMiA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAvLyBOZXd0b24ncyBpdGVyYXRpb24hXG4gICAgdmFsICA9IExvbmcuZnJvbUludCh2YWwpO1xuICAgIHZhciB0ID0gTG9uZy5mcm9tSW50KHZhbCk7XG4gICAgdmFyIHR3byA9IExvbmcuZnJvbUludCgyKTtcbiAgICBcbiAgICB0ID0gTG9uZy5mcm9tTnVtYmVyKHQubXVsdGlwbHkodHdvLnN1YnRyYWN0KHZhbC5tdWx0aXBseSh0KSkpLmxvdyk7XG4gICAgdCA9IExvbmcuZnJvbU51bWJlcih0Lm11bHRpcGx5KHR3by5zdWJ0cmFjdCh2YWwubXVsdGlwbHkodCkpKS5sb3cpO1xuICAgIHQgPSBMb25nLmZyb21OdW1iZXIodC5tdWx0aXBseSh0d28uc3VidHJhY3QodmFsLm11bHRpcGx5KHQpKSkubG93KTtcbiAgICB0ID0gdC5tdWx0aXBseSh0d28uc3VidHJhY3QodmFsLm11bHRpcGx5KHQpKSkubG93O1xuXG4gICAgcmV0dXJuIHQ7XG59XG5cbi8qKlxuICogQ29udmVydCB0aGlzIE11dGFibGVCaWdJbnRlZ2VyIGludG8gYW4gaW50IGFycmF5IHdpdGggbm8gbGVhZGluZ1xuICogemVyb3MsIG9mIGEgbGVuZ3RoIHRoYXQgaXMgZXF1YWwgdG8gdGhpcyBNdXRhYmxlQmlnSW50ZWdlcidzIGludExlbi5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLnRvSW50QXJyYXkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciByZXN1bHQgPSBDb21tb24uaW50QXJyYXkodGhpcy5pbnRMZW4pO1xuICBmb3IodmFyIGkgPSAwOyBpIDwgdGhpcy5pbnRMZW47IGkrKylcbiAgICByZXN1bHRbaV0gPSB0aGlzLnZhbHVlW3RoaXMub2Zmc2V0ICsgaV07XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmZiB0aGlzIE11dGFibGVCaWdJbnRlZ2VyIGhhcyBhIHZhbHVlIG9mIHplcm8uXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5pc1plcm8gPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICh0aGlzLmludExlbiA9PT0gMCk7XG59XG5cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5pc09kZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuaXNaZXJvKCkgPyBmYWxzZSA6ICgodGhpcy52YWx1ZVt0aGlzLm9mZnNldCArIHRoaXMuaW50TGVuIC0gMV0gJiAxKSA9PT0gMSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmZiB0aGlzIE11dGFibGVCaWdJbnRlZ2VyIGhhcyBhIHZhbHVlIG9mIG9uZS5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmlzT25lID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gKHRoaXMuaW50TGVuID09IDEpICYmICh0aGlzLnZhbHVlW3RoaXMub2Zmc2V0XSA9PSAxKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWZmIHRoaXMgTXV0YWJsZUJpZ0ludGVnZXIgaXMgZXZlbi5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmlzRXZlbiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuICh0aGlzLmludExlbiA9PSAwKSB8fCAoKHRoaXMudmFsdWVbdGhpcy5vZmZzZXQgKyB0aGlzLmludExlbiAtIDFdICYgMSkgPT0gMCk7XG59XG5cbi8qKlxuKiBSZXR1cm4gdGhlIGluZGV4IG9mIHRoZSBsb3dlc3Qgc2V0IGJpdCBpbiB0aGlzIE11dGFibGVCaWdJbnRlZ2VyLiBJZiB0aGVcbiogbWFnbml0dWRlIG9mIHRoaXMgTXV0YWJsZUJpZ0ludGVnZXIgaXMgemVybywgLTEgaXMgcmV0dXJuZWQuXG4qL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLmdldExvd2VzdFNldEJpdCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaW50TGVuID09IDApXG4gICAgICByZXR1cm4gLTE7XG4gIHZhciBqLCBiO1xuICBmb3IgKGogPSB0aGlzLmludExlbi0xOyAoaj4wKSAmJiAodGhpcy52YWx1ZVtqK3RoaXMub2Zmc2V0XT09MCk7IGotLSlcbiAgICAgIDtcbiAgYiA9IHRoaXMudmFsdWVbait0aGlzLm9mZnNldF07XG4gIGlmIChiPT0wKVxuICAgICAgcmV0dXJuIC0xO1xuICByZXR1cm4gKCh0aGlzLmludExlbi0xLWopPDw1KSArIEludGVnZXIubnVtYmVyT2ZUcmFpbGluZ1plcm9zKGIpO1xufVxuXG5cbi8qKlxuICogQ2FsY3VsYXRlIHRoZSBtdWx0aXBsaWNhdGl2ZSBpbnZlcnNlIG9mIHRoaXMgbW9kIG1vZCwgd2hlcmUgbW9kIGlzIG9kZC5cbiAqIFRoaXMgYW5kIG1vZCBhcmUgbm90IGNoYW5nZWQgYnkgdGhlIGNhbGN1bGF0aW9uLlxuICpcbiAqIFRoaXMgbWV0aG9kIGltcGxlbWVudHMgYW4gYWxnb3JpdGhtIGR1ZSB0byBSaWNoYXJkIFNjaHJvZXBwZWwsIHRoYXQgdXNlc1xuICogdGhlIHNhbWUgaW50ZXJtZWRpYXRlIHJlcHJlc2VudGF0aW9uIGFzIE1vbnRnb21lcnkgUmVkdWN0aW9uXG4gKiAoXCJNb250Z29tZXJ5IEZvcm1cIikuICBUaGUgYWxnb3JpdGhtIGlzIGRlc2NyaWJlZCBpbiBhbiB1bnB1Ymxpc2hlZFxuICogbWFudXNjcmlwdCBlbnRpdGxlZCBcIkZhc3QgTW9kdWxhciBSZWNpcHJvY2Fscy5cIlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUubW9kSW52ZXJzZSA9IGZ1bmN0aW9uIChtb2QpIHtcbiAgICB2YXIgcCA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcihtb2QpO1xuICAgIHZhciBmID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHRoaXMpO1xuICAgIHZhciBnID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHApO1xuICAgIHZhciBjID0gbmV3IFNpZ25lZE11dGFibGVCaWdJbnRlZ2VyKDEpO1xuICAgIHZhciBkID0gbmV3IFNpZ25lZE11dGFibGVCaWdJbnRlZ2VyKCk7XG4gICAgdmFyIHRlbXAgPSBudWxsO1xuICAgIHZhciBzVGVtcCA9IG51bGw7XG5cbiAgICB2YXIgayA9IDA7XG4gICAgLy8gUmlnaHQgc2hpZnQgZiBrIHRpbWVzIHVudGlsIG9kZCwgbGVmdCBzaGlmdCBkIGsgdGltZXNcbiAgICBpZiAoZi5pc0V2ZW4oKSkge1xuICAgICAgICB2YXIgdHJhaWxpbmdaZXJvcyA9IGYuZ2V0TG93ZXN0U2V0Qml0KCk7XG4gICAgICAgIGYucmlnaHRTaGlmdCh0cmFpbGluZ1plcm9zKTtcbiAgICAgICAgZC5sZWZ0U2hpZnQodHJhaWxpbmdaZXJvcyk7XG4gICAgICAgIGsgPSB0cmFpbGluZ1plcm9zO1xuICAgIH1cbiAgICAvLyBUaGUgQWxtb3N0IEludmVyc2UgQWxnb3JpdGhtXG4gICAgd2hpbGUoIWYuaXNPbmUoKSkge1xuICAgICAgICAvLyBJZiBnY2QoZiwgZykgIT0gMSwgbnVtYmVyIGlzIG5vdCBpbnZlcnRpYmxlIG1vZHVsbyBtb2RcbiAgICAgICAgaWYgKGYuaXNaZXJvKCkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCaWdJbnRlZ2VyIG5vdCBpbnZlcnRpYmxlLlwiKTtcblxuICAgICAgICAvLyBJZiBmIDwgZyBleGNoYW5nZSBmLCBnIGFuZCBjLCBkXG4gICAgICAgIGlmIChmLmNvbXBhcmUoZykgPCAwKSB7XG4gICAgICAgICAgICB0ZW1wID0gZjsgZiA9IGc7IGcgPSB0ZW1wO1xuICAgICAgICAgICAgc1RlbXAgPSBkOyBkID0gYzsgYyA9IHNUZW1wO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgZiA9PSBnIChtb2QgNClcbiAgICAgICAgaWYgKCgoZi52YWx1ZVtmLm9mZnNldCArIGYuaW50TGVuIC0gMV0gXlxuICAgICAgICAgICAgIGcudmFsdWVbZy5vZmZzZXQgKyBnLmludExlbiAtIDFdKSAmIDMpID09IDApIHtcbiAgICAgICAgICAgIGYuc3VidHJhY3QoZyk7XG4gICAgICAgICAgICBjLnNpZ25lZFN1YnRyYWN0KGQpO1xuICAgICAgICB9IGVsc2UgeyAvLyBJZiBmICE9IGcgKG1vZCA0KVxuICAgICAgICAgICAgZi5hZGQoZyk7XG4gICAgICAgICAgICBjLnNpZ25lZEFkZChkKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBSaWdodCBzaGlmdCBmIGsgdGltZXMgdW50aWwgb2RkLCBsZWZ0IHNoaWZ0IGQgayB0aW1lc1xuICAgICAgICB2YXIgdHJhaWxpbmdaZXJvcyA9IGYuZ2V0TG93ZXN0U2V0Qml0KCk7XG4gICAgICAgIGYucmlnaHRTaGlmdCh0cmFpbGluZ1plcm9zKTtcbiAgICAgICAgZC5sZWZ0U2hpZnQodHJhaWxpbmdaZXJvcyk7XG4gICAgICAgIGsgKz0gdHJhaWxpbmdaZXJvcztcbiAgICB9XG4gICAgXG4gICAgd2hpbGUgKGMuc2lnbiA8IDApIHtcbiAgICAgIGMuc2lnbmVkQWRkKHApO1xuICAgIH1cbiAgICByZXR1cm4gZml4dXAoYywgcCwgayk7XG59XG4vKlxuICogVGhlIEZpeHVwIEFsZ29yaXRobVxuICogQ2FsY3VsYXRlcyBYIHN1Y2ggdGhhdCBYID0gQyAqIDJeKC1rKSAobW9kIFApXG4gKiBBc3N1bWVzIEM8UCBhbmQgUCBpcyBvZGQuXG4gKi9cbmZ1bmN0aW9uIGZpeHVwKGMsIHAsIGspIHtcbiAgdmFyIHRlbXAgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoKTtcbiAgLy8gU2V0IHIgdG8gdGhlIG11bHRpcGxpY2F0aXZlIGludmVyc2Ugb2YgcCBtb2QgMl4zMlxuICB2YXIgciA9IC1NdXRhYmxlQmlnSW50ZWdlci5pbnZlcnNlTW9kMzIocC52YWx1ZVtwLm9mZnNldCtwLmludExlbi0xXSk7XG4gIGZvcih2YXIgaT0wLCBudW1Xb3JkcyA9IGsgPj4gNTsgaTxudW1Xb3JkczsgaSsrKSB7XG4gICAgICAvLyBWID0gUiAqIGMgKG1vZCAyXmopXG4gICAgICB2YXIgdiA9IExvbmcuZnJvbU51bWJlcihyKS5tdWx0aXBseShjLnZhbHVlW2Mub2Zmc2V0ICsgYy5pbnRMZW4gLSAxXSkubG93O1xuICAgICAgLy8gdmFyICB2ID0gciAqIGMudmFsdWVbYy5vZmZzZXQgKyBjLmludExlbiAtIDFdO1xuICAgICAgLy8gYyA9IGMgKyAodiAqIHApXG4gICAgICBwLm11bCh2LCB0ZW1wKTtcbiAgICAgIGMuYWRkKHRlbXApO1xuICAgICAgLy8gYyA9IGMgLyAyXmpcbiAgICAgIGMuaW50TGVuLS07XG4gIH1cbiAgdmFyIG51bUJpdHMgPSBrICYgMHgxZjtcbiAgaWYgKG51bUJpdHMgIT0gMCkge1xuICAgICAgdmFyIHYgPSBMb25nLmZyb21OdW1iZXIocikubXVsdGlwbHkoYy52YWx1ZVtjLm9mZnNldCArIGMuaW50TGVuIC0gMV0pLmxvdztcbiAgICAgIHYgJj0gKCgxIDw8IG51bUJpdHMpIC0gMSk7XG4gICAgICAvLyBjID0gYyArICh2ICogcClcbiAgICAgIHAubXVsKHYsIHRlbXApO1xuICAgICAgYy5hZGQodGVtcCk7XG4gICAgICAvLyBjID0gYyAvIDJealxuICAgICAgYy5yaWdodFNoaWZ0KG51bUJpdHMpO1xuICB9XG4gIC8vIEluIHRoZW9yeSwgYyBtYXkgYmUgZ3JlYXRlciB0aGFuIHAgYXQgdGhpcyBwb2ludCAoVmVyeSByYXJlISlcbiAgd2hpbGUgKGMuY29tcGFyZShwKSA+PSAwKVxuICAgIGMuc3VidHJhY3QocCk7XG4gIHJldHVybiBjO1xufVxuXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMub2Zmc2V0ID0gdGhpcy5pbnRMZW4gPSAwO1xufTtcblxuLyoqXG4gKiBTdWJ0cmFjdHMgdGhlIHNtYWxsZXIgb2YgdGhpcyBhbmQgYiBmcm9tIHRoZSBsYXJnZXIgYW5kIHBsYWNlcyB0aGVcbiAqIHJlc3VsdCBpbnRvIHRoaXMgTXV0YWJsZUJpZ0ludGVnZXIuXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5zdWJ0cmFjdCA9IGZ1bmN0aW9uIChiKSB7XG4gICAgdmFyIGEgPSB0aGlzO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMudmFsdWU7XG4gICAgdmFyIHNpZ24gPSBhLmNvbXBhcmUoYik7XG5cbiAgICBpZiAoc2lnbiA9PSAwKSB7XG4gICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICAgIGlmIChzaWduIDwgMCkge1xuICAgICAgICB2YXIgdG1wID0gYTtcbiAgICAgICAgYSA9IGI7XG4gICAgICAgIGIgPSB0bXA7XG4gICAgfVxuXG4gICAgdmFyIHJlc3VsdExlbiA9IGEuaW50TGVuO1xuICAgIGlmIChyZXN1bHQubGVuZ3RoIDwgcmVzdWx0TGVuKVxuICAgICAgICByZXN1bHQgPSBDb21tb24uaW50QXJyYXkocmVzdWx0TGVuKTtcblxuICAgIHZhciBkaWZmID0gTG9uZy5mcm9tSW50KDApO1xuICAgIHZhciB4ID0gYS5pbnRMZW47XG4gICAgdmFyIHkgPSBiLmludExlbjtcbiAgICB2YXIgcnN0YXJ0ID0gcmVzdWx0Lmxlbmd0aCAtIDE7XG5cbiAgICAvLyBTdWJ0cmFjdCBjb21tb24gcGFydHMgb2YgYm90aCBudW1iZXJzXG4gICAgd2hpbGUgKHk+MCkge1xuICAgICAgICB4LS07IHktLTtcblxuICAgICAgICBkaWZmID0gTG9uZy5mcm9tTnVtYmVyKGEudmFsdWVbeCthLm9mZnNldF0gPj4+IDMyKS5zdWJ0cmFjdChcbiAgICAgICAgICAgIExvbmcuZnJvbU51bWJlcigoYi52YWx1ZVt5K2Iub2Zmc2V0XSA+Pj4gMzIpKVxuICAgICAgICApLnN1YnRyYWN0KFxuICAgICAgICAgICBMb25nLmZyb21OdW1iZXIoZGlmZi5zaGlmdFJpZ2h0KDMyKS5uZWdhdGUoKS5sb3cpXG4gICAgICAgICk7XG5cbiAgICAgICAgcmVzdWx0W3JzdGFydC0tXSA9IGRpZmYubG93O1xuICAgIH1cbiAgICAvLyBTdWJ0cmFjdCByZW1haW5kZXIgb2YgbG9uZ2VyIG51bWJlclxuICAgIHdoaWxlICh4PjApIHtcbiAgICAgICAgeC0tO1xuICAgICAgICBkaWZmID0gTG9uZy5mcm9tTnVtYmVyKGEudmFsdWVbeCthLm9mZnNldF0gPj4+IDMyKS5zdWJ0cmFjdChcbiAgICAgICAgICAgTG9uZy5mcm9tTnVtYmVyKGRpZmYuc2hpZnRSaWdodCgzMikubmVnYXRlKCkubG93KVxuICAgICAgICApO1xuICAgICAgICByZXN1bHRbcnN0YXJ0LS1dID0gZGlmZi5sb3c7XG4gICAgfVxuXG4gICAgdGhpcy52YWx1ZSA9IHJlc3VsdDtcbiAgICB0aGlzLmludExlbiA9IHJlc3VsdExlbjtcbiAgICB0aGlzLm9mZnNldCA9IHRoaXMudmFsdWUubGVuZ3RoIC0gcmVzdWx0TGVuO1xuICAgIHRoaXMubm9ybWFsaXplKCk7XG4gICAgcmV0dXJuIHNpZ247XG59XG5cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5vZmZzZXQgPSB0aGlzLmludExlbiA9IDA7XG59XG5cbi8qKlxuICogU2V0cyB0aGlzIE11dGFibGVCaWdJbnRlZ2VyJ3MgdmFsdWUgYXJyYXkgdG8gYSBjb3B5IG9mIHRoZSBzcGVjaWZpZWRcbiAqIGFycmF5LiBUaGUgaW50TGVuIGlzIHNldCB0byB0aGUgbGVuZ3RoIG9mIHRoZSBuZXcgYXJyYXkuXG4gKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5jb3B5VmFsdWUgPSBmdW5jdGlvbiAoc3JjKSB7XG4gIGlmIChzcmMuY29uc3RydWN0b3IubmFtZSA9PT0gJ011dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIHZhciBsZW4gPSBzcmMuaW50TGVuO1xuICAgIGlmICh0aGlzLnZhbHVlLmxlbmd0aCA8IGxlbilcbiAgICAgIHRoaXMudmFsdWUgPSBDb21tb24uaW50QXJyYXkobGVuKTtcbiAgICBDb21tb24uYXJyYXljb3B5KHNyYy52YWx1ZSwgc3JjLm9mZnNldCwgdGhpcy52YWx1ZSwgMCwgbGVuKTtcbiAgICB0aGlzLmludExlbiA9IGxlbjtcbiAgICB0aGlzLm9mZnNldCA9IDA7ICBcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNyYykpIHtcbiAgICB2YXIgdmFsID0gc3JjO1xuICAgIHZhciBsZW4gPSB2YWwubGVuZ3RoO1xuICAgIGlmICh0aGlzLnZhbHVlLmxlbmd0aCA8IGxlbilcbiAgICAgICAgdGhpcy52YWx1ZSA9IENvbW1vbi5pbnRBcnJheShsZW4pO1xuICAgIENvbW1vbi5hcnJheWNvcHkodmFsLCAwLCB0aGlzLnZhbHVlLCAwLCBsZW4pO1xuICAgIHRoaXMuaW50TGVuID0gbGVuO1xuICAgIHRoaXMub2Zmc2V0ID0gMDtcbiAgfVxuICBcbn1cblxuLyoqXG4gKiBNdWx0aXBseSB0aGUgY29udGVudHMgb2YgdGhpcyBNdXRhYmxlQmlnSW50ZWdlciBieSB0aGUgd29yZCB5LiBUaGVcbiAqIHJlc3VsdCBpcyBwbGFjZWQgaW50byB6LlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUubXVsID0gZnVuY3Rpb24gKHksIHopIHtcbiAgaWYgKHkgPT0gMSkge1xuICAgICAgei5jb3B5VmFsdWUodGhpcyk7XG4gICAgICByZXR1cm47XG4gIH1cblxuICBpZiAoeSA9PSAwKSB7XG4gICAgICB6LmNsZWFyKCk7XG4gICAgICByZXR1cm47XG4gIH1cblxuICAvLyBQZXJmb3JtIHRoZSBtdWx0aXBsaWNhdGlvbiB3b3JkIGJ5IHdvcmRcbiAgdmFyIHlsb25nID0gTG9uZy5mcm9tTnVtYmVyKHkgPj4+IDMyKTtcbiAgdmFyIHp2YWwgPSAoei52YWx1ZS5sZW5ndGggPCB0aGlzLmludExlbisxID8gQ29tbW9uLmludEFycmF5KHRoaXMuaW50TGVuICsgMSkgOiB6LnZhbHVlKTtcbiAgdmFyIGNhcnJ5ID0gTG9uZy5mcm9tSW50KDApO1xuICBmb3IgKHZhciBpID0gdGhpcy5pbnRMZW4tMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHZhciBwcm9kdWN0ID0geWxvbmcubXVsdGlwbHkoTG9uZy5mcm9tTnVtYmVyKHRoaXMudmFsdWVbaSt0aGlzLm9mZnNldF0gPj4+IDMyKSkuYWRkKGNhcnJ5KTtcbiAgICAgIHp2YWxbaSsxXSA9IHByb2R1Y3QubG93O1xuICAgICAgY2FycnkgPSBwcm9kdWN0LnNoaWZ0UmlnaHRVbnNpZ25lZCgzMik7XG4gIH1cblxuICBpZiAoY2FycnkudG9OdW1iZXIoKSA9PT0gMCkge1xuICAgICAgei5vZmZzZXQgPSAxO1xuICAgICAgei5pbnRMZW4gPSB0aGlzLmludExlbjtcbiAgfSBlbHNlIHtcbiAgICAgIHoub2Zmc2V0ID0gMDtcbiAgICAgIHouaW50TGVuID0gdGhpcy5pbnRMZW4gKyAxO1xuICAgICAgenZhbFswXSA9IGNhcnJ5LmxvdztcbiAgfVxuICB6LnZhbHVlID0genZhbDtcbn1cblxuLyoqXG4gKiBNdWx0aXBseSB0aGUgY29udGVudHMgb2YgdHdvIE11dGFibGVCaWdJbnRlZ2VyIG9iamVjdHMuIFRoZSByZXN1bHQgaXNcbiAqIHBsYWNlZCBpbnRvIE11dGFibGVCaWdJbnRlZ2VyIHouIFRoZSBjb250ZW50cyBvZiB5IGFyZSBub3QgY2hhbmdlZC5cbiAqL1xuTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24gKHksIHopIHtcbiAgICB2YXIgeExlbiA9IHRoaXMuaW50TGVuO1xuICAgIHZhciB5TGVuID0geS5pbnRMZW47XG4gICAgdmFyIG5ld0xlbiA9IHhMZW4gKyB5TGVuO1xuXG4gICAgLy8gUHV0IHogaW50byBhbiBhcHByb3ByaWF0ZSBzdGF0ZSB0byByZWNlaXZlIHByb2R1Y3RcbiAgICBpZiAoei52YWx1ZS5sZW5ndGggPCBuZXdMZW4pXG4gICAgICAgIHoudmFsdWUgPSBDb21tb24uaW50QXJyYXkobmV3TGVuKTtcbiAgICB6Lm9mZnNldCA9IDA7XG4gICAgei5pbnRMZW4gPSBuZXdMZW47XG5cbiAgICAvLyBUaGUgZmlyc3QgaXRlcmF0aW9uIGlzIGhvaXN0ZWQgb3V0IG9mIHRoZSBsb29wIHRvIGF2b2lkIGV4dHJhIGFkZFxuICAgIHZhciBjYXJyeSA9IExvbmcuZnJvbUludCgwKTtcbiAgICBmb3IgKHZhciBqPXlMZW4tMSwgaz15TGVuK3hMZW4tMTsgaiA+PSAwOyBqLS0sIGstLSkge1xuICAgICAgICB2YXIgcHJvZHVjdCA9IExvbmcuZnJvbU51bWJlcih5LnZhbHVlW2oreS5vZmZzZXRdID4+PiAzMikubXVsdGlwbHkoXG4gICAgICAgICAgICBMb25nLmZyb21OdW1iZXIodGhpcy52YWx1ZVt4TGVuIC0gMSArIHRoaXMub2Zmc2V0XSA+Pj4gMzIpXG4gICAgICAgICkuYWRkKGNhcnJ5KTtcbiAgICAgICAgei52YWx1ZVtrXSA9IHByb2R1Y3QubG93O1xuICAgICAgICBjYXJyeSA9IHByb2R1Y3Quc2hpZnRSaWdodFVuc2lnbmVkKDMyKTtcbiAgICB9XG4gICAgei52YWx1ZVt4TGVuLTFdID0gY2FycnkubG93O1xuXG4gICAgLy8gUGVyZm9ybSB0aGUgbXVsdGlwbGljYXRpb24gd29yZCBieSB3b3JkXG4gICAgZm9yICh2YXIgaSA9IHhMZW4tMjsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY2FycnkgPSBMb25nLmZyb21JbnQoMCk7XG4gICAgICAgIGZvciAodmFyIGo9eUxlbi0xLCBrPXlMZW4raTsgaiA+PSAwOyBqLS0sIGstLSkge1xuICAgICAgICAgICAgdmFyIHByb2R1Y3QgPSBMb25nLmZyb21OdW1iZXIoeS52YWx1ZVtqK3kub2Zmc2V0XSA+Pj4gMzIpLm11bHRpcGx5KFxuICAgICAgICAgICAgICAgIExvbmcuZnJvbU51bWJlcih0aGlzLnZhbHVlW2kgKyB0aGlzLm9mZnNldF0gPj4+IDMyKVxuICAgICAgICAgICAgKS5hZGQoXG4gICAgICAgICAgICAgICAgTG9uZy5mcm9tTnVtYmVyKHoudmFsdWVba10gPj4+IDMyKVxuICAgICAgICAgICAgKS5hZGQoY2FycnkpO1xuICAgICAgICAgICAgei52YWx1ZVtrXSA9IHByb2R1Y3QubG93O1xuICAgICAgICAgICAgY2FycnkgPSBwcm9kdWN0LnNoaWZ0UmlnaHRVbnNpZ25lZCgzMik7XG4gICAgICAgIH1cbiAgICAgICAgei52YWx1ZVtpXSA9IGNhcnJ5LmxvdztcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgbGVhZGluZyB6ZXJvcyBmcm9tIHByb2R1Y3RcbiAgICB6Lm5vcm1hbGl6ZSgpO1xufVxuXG5cbi8qKlxuICogQWRkcyB0aGUgY29udGVudHMgb2YgdHdvIE11dGFibGVCaWdJbnRlZ2VyIG9iamVjdHMuVGhlIHJlc3VsdFxuICogaXMgcGxhY2VkIHdpdGhpbiB0aGlzIE11dGFibGVCaWdJbnRlZ2VyLlxuICogVGhlIGNvbnRlbnRzIG9mIHRoZSBhZGRlbmQgYXJlIG5vdCBjaGFuZ2VkLlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKGFkZGVuZCkge1xuICAgIHZhciB4ID0gdGhpcy5pbnRMZW47XG4gICAgdmFyIHkgPSBhZGRlbmQuaW50TGVuO1xuICAgIHZhciByZXN1bHRMZW4gPSAodGhpcy5pbnRMZW4gPiBhZGRlbmQuaW50TGVuID8gdGhpcy5pbnRMZW4gOiBhZGRlbmQuaW50TGVuKTtcbiAgICB2YXIgcmVzdWx0ID0gKHRoaXMudmFsdWUubGVuZ3RoIDwgcmVzdWx0TGVuID8gQ29tbW9uLmludEFycmF5KHJlc3VsdExlbikgOiB0aGlzLnZhbHVlKTtcblxuICAgIHZhciByc3RhcnQgPSByZXN1bHQubGVuZ3RoLTE7XG4gICAgdmFyIHN1bTtcbiAgICB2YXIgY2FycnkgPSBMb25nLmZyb21JbnQoMCk7XG5cbiAgICAvLyBBZGQgY29tbW9uIHBhcnRzIG9mIGJvdGggbnVtYmVyc1xuICAgIHdoaWxlKHg+MCAmJiB5PjApIHtcbiAgICAgICAgeC0tOyB5LS07XG4gICAgICAgIHN1bSA9IExvbmcuZnJvbU51bWJlcih0aGlzLnZhbHVlW3grdGhpcy5vZmZzZXRdID4+PiAzMikuYWRkKFxuICAgICAgICAgICAgTG9uZy5mcm9tTnVtYmVyKGFkZGVuZC52YWx1ZVt5K2FkZGVuZC5vZmZzZXRdID4+PiAzMilcbiAgICAgICAgKS5hZGQoY2FycnkpO1xuXG4gICAgICAgIHJlc3VsdFtyc3RhcnQtLV0gPSBzdW0ubG93O1xuICAgICAgICBjYXJyeSA9IHN1bS5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpO1xuICAgIH1cblxuICAgIC8vIEFkZCByZW1haW5kZXIgb2YgdGhlIGxvbmdlciBudW1iZXJcbiAgICB3aGlsZSh4PjApIHtcbiAgICAgICAgeC0tO1xuICAgICAgICBpZiAoY2FycnkgPT0gMCAmJiByZXN1bHQgPT0gdGhpcy52YWx1ZSAmJiByc3RhcnQgPT0gKHggKyB0aGlzLm9mZnNldCkpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHN1bSA9IExvbmcuZnJvbU51bWJlcih0aGlzLnZhbHVlW3grdGhpcy5vZmZzZXRdID4+PiAzMikuYWRkKGNhcnJ5KTtcbiAgICAgICAgcmVzdWx0W3JzdGFydC0tXSA9IHN1bS5sb3c7XG4gICAgICAgIGNhcnJ5ID0gc3VtLnNoaWZ0UmlnaHRVbnNpZ25lZCgzMik7XG4gICAgfVxuICAgIHdoaWxlKHk+MCkge1xuICAgICAgICB5LS07XG4gICAgICAgIHN1bSA9IExvbmcuZnJvbU51bWJlcihhZGRlbmQudmFsdWVbeSthZGRlbmQub2Zmc2V0XSA+Pj4gMzIpLmFkZChjYXJyeSk7XG4gICAgICAgIHJlc3VsdFtyc3RhcnQtLV0gPSBzdW0ubG93O1xuICAgICAgICBjYXJyeSA9IHN1bS5zaGlmdFJpZ2h0VW5zaWduZWQoMzIpO1xuICAgIH1cblxuICAgIGlmIChjYXJyeS50b051bWJlcigpID4gMCkgeyAvLyBSZXN1bHQgbXVzdCBncm93IGluIGxlbmd0aFxuICAgICAgICByZXN1bHRMZW4rKztcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggPCByZXN1bHRMZW4pIHtcbiAgICAgICAgICAgIHZhciB0ZW1wID0gQ29tbW9uLmludEFycmF5KHJlc3VsdExlbik7XG4gICAgICAgICAgICAvLyBSZXN1bHQgb25lIHdvcmQgbG9uZ2VyIGZyb20gY2Fycnktb3V0OyBjb3B5IGxvdy1vcmRlclxuICAgICAgICAgICAgLy8gYml0cyBpbnRvIG5ldyByZXN1bHQuXG4gICAgICAgICAgICBDb21tb24uYXJyYXljb3B5KHJlc3VsdCwgMCwgdGVtcCwgMSwgcmVzdWx0Lmxlbmd0aCk7XG4gICAgICAgICAgICB0ZW1wWzBdID0gMTtcbiAgICAgICAgICAgIHJlc3VsdCA9IHRlbXA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRbcnN0YXJ0LS1dID0gMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMudmFsdWUgPSByZXN1bHQ7XG4gICAgdGhpcy5pbnRMZW4gPSByZXN1bHRMZW47XG4gICAgdGhpcy5vZmZzZXQgPSByZXN1bHQubGVuZ3RoIC0gcmVzdWx0TGVuO1xufVxuXG5cbi8qXG4gKiBDYWxjdWxhdGUgdGhlIG11bHRpcGxpY2F0aXZlIGludmVyc2Ugb2YgdGhpcyBtb2QgMl5rLlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUubW9kSW52ZXJzZU1QMiA9IGZ1bmN0aW9uIChrKSB7XG4gICAgaWYgKHRoaXMuaXNFdmVuKCkpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vbi1pbnZlcnRpYmxlLiAoR0NEICE9IDEpXCIpO1xuXG4gICAgaWYgKGsgPiA2NClcbiAgICAgICAgcmV0dXJuIHRoaXMuZXVjbGlkTW9kSW52ZXJzZShrKTtcblxuICAgIHZhciB0ID0gTXV0YWJsZUJpZ0ludGVnZXIuaW52ZXJzZU1vZDMyKHRoaXMudmFsdWVbdGhpcy5vZmZzZXQgKyB0aGlzLmludExlbiAtIDFdKTtcblxuICAgIGlmIChrIDwgMzMpIHtcbiAgICAgICAgdCA9IChrID09IDMyID8gdCA6IHQgJiAoKDEgPDwgaykgLSAxKSk7XG4gICAgICAgIHJldHVybiBuZXcgTXV0YWJsZUJpZ0ludGVnZXIodCk7XG4gICAgfVxuXG4gICAgdmFyIHBMb25nID0gTG9uZy5mcm9tTnVtYmVyKHRoaXMudmFsdWVbdGhpcy5vZmZzZXQrdGhpcy5pbnRMZW4tMV0gPj4+IDMyKTtcbiAgICBpZiAodGhpcy5pbnRMZW4gPiAxKVxuICAgICAgICBwTG9uZyA9ICBwTG9uZy5vcihMb25nLmZyb21JbnQodGhpcy52YWx1ZVt0aGlzLm9mZnNldCt0aGlzLmludExlbi0yXSA8PCAzMikpO1xuICAgIHZhciB0TG9uZyA9IExvbmcuZnJvbU51bWJlcih0ID4+PiAzMik7XG4gICAgdExvbmcgPSB0TG9uZy5tdWx0aXBseShMb25nLmZyb21JbnQoMikuc3VidHJhY3QocExvbmcubXVsdGlwbHkodExvbmcpKSk7ICAvLyAxIG1vcmUgTmV3dG9uIGl0ZXIgc3RlcFxuICAgIHRMb25nID0gKGsgPT0gNjQgPyB0TG9uZyA6IHRMb25nLmFuZChcbiAgICAgICAgICAgIExvbmcuZnJvbUludCgxKS5zaGlmdExlZnQoaykuc3VidHJhY3QoXG4gICAgICAgICAgICAgICAgTG9uZy5mcm9tSW50KDEpXG4gICAgICAgICAgICApXG4gICAgICAgIClcbiAgICApO1xuXG4gICAgdmFyIHJlc3VsdCA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcihDb21tb24uaW50QXJyYXkoMikpO1xuICAgIHJlc3VsdC52YWx1ZVswXSA9IHRMb25nLnNoaWZ0UmlnaHRVbnNpZ25lZCgzMikubG93O1xuICAgIHJlc3VsdC52YWx1ZVsxXSA9IHRMb25nLmxvdztcbiAgICByZXN1bHQuaW50TGVuID0gMjtcbiAgICByZXN1bHQubm9ybWFsaXplKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBVc2VzIHRoZSBleHRlbmRlZCBFdWNsaWRlYW4gYWxnb3JpdGhtIHRvIGNvbXB1dGUgdGhlIG1vZEludmVyc2Ugb2YgYmFzZVxuICogbW9kIGEgbW9kdWx1cyB0aGF0IGlzIGEgcG93ZXIgb2YgMi4gVGhlIG1vZHVsdXMgaXMgMl5rLlxuICovXG5NdXRhYmxlQmlnSW50ZWdlci5wcm90b3R5cGUuZXVjbGlkTW9kSW52ZXJzZSA9IGZ1bmN0aW9uIChrKSB7XG4gICAgdmFyIGIgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoMSk7XG4gICAgYi5sZWZ0U2hpZnQoayk7XG4gICAgdmFyIG1vZCA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcihiKTtcblxuICAgIHZhciBhID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKHRoaXMpO1xuICAgIHZhciBxID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKCk7XG4gICAgdmFyIHIgPSBiLmRpdmlkZShhLCBxKTtcblxuICAgIHZhciBzd2FwcGVyID0gYjtcbiAgICAvLyBzd2FwIGIgJiByXG4gICAgYiA9IHI7XG4gICAgciA9IHN3YXBwZXI7XG5cbiAgICB2YXIgdDEgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIocSk7XG4gICAgdmFyIHQwID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKDEpO1xuICAgIHZhciB0ZW1wID0gbmV3IE11dGFibGVCaWdJbnRlZ2VyKCk7XG5cbiAgICB3aGlsZSAoIWIuaXNPbmUoKSkge1xuICAgICAgICByID0gYS5kaXZpZGUoYiwgcSk7XG5cbiAgICAgICAgaWYgKHIuaW50TGVuID09IDApXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCaWdJbnRlZ2VyVGVzdCBub3QgaW52ZXJ0aWJsZS5cIik7XG5cbiAgICAgICAgc3dhcHBlciA9IHI7XG4gICAgICAgIGEgPSBzd2FwcGVyO1xuXG4gICAgICAgIGlmIChxLmludExlbiA9PSAxKVxuICAgICAgICAgICAgdDEubXVsKHEudmFsdWVbcS5vZmZzZXRdLCB0ZW1wKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcS5tdWx0aXBseSh0MSwgdGVtcCk7XG4gICAgICAgIHN3YXBwZXIgPSBxO1xuICAgICAgICBxID0gdGVtcDtcbiAgICAgICAgdGVtcCA9IHN3YXBwZXI7XG4gICAgICAgIHQwLmFkZChxKTtcblxuICAgICAgICBpZiAoYS5pc09uZSgpKVxuICAgICAgICAgICAgcmV0dXJuIHQwO1xuXG4gICAgICAgIHIgPSBiLmRpdmlkZShhLCBxKTtcblxuICAgICAgICBpZiAoci5pbnRMZW4gPT0gMClcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkJpZ0ludGVnZXJUZXN0IG5vdCBpbnZlcnRpYmxlLlwiKTtcblxuICAgICAgICBzd2FwcGVyID0gYjtcbiAgICAgICAgYiA9ICByO1xuXG4gICAgICAgIGlmIChxLmludExlbiA9PSAxKVxuICAgICAgICAgICAgdDAubXVsKHEudmFsdWVbcS5vZmZzZXRdLCB0ZW1wKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcS5tdWx0aXBseSh0MCwgdGVtcCk7XG4gICAgICAgIHN3YXBwZXIgPSBxOyBxID0gdGVtcDsgdGVtcCA9IHN3YXBwZXI7XG5cbiAgICAgICAgdDEuYWRkKHEpO1xuICAgIH1cbiAgICBtb2Quc3VidHJhY3QodDEpO1xuICAgIHJldHVybiBtb2Q7XG59XG5cbi8qKlxuKiBSZXR1cm5zIHRoZSBtb2RJbnZlcnNlIG9mIHRoaXMgbW9kIHAuIFRoaXMgYW5kIHAgYXJlIG5vdCBhZmZlY3RlZCBieVxuKiB0aGUgb3BlcmF0aW9uLlxuKi9cbk11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5tdXRhYmxlTW9kSW52ZXJzZSA9IGZ1bmN0aW9uIChwKSB7XG4gIC8vIE1vZHVsdXMgaXMgb2RkLCB1c2UgU2Nocm9lcHBlbCdzIGFsZ29yaXRobVxuICBpZiAocC5pc09kZCgpKSB7XG4gICAgcmV0dXJuIHRoaXMubW9kSW52ZXJzZShwKTtcbiAgfVxuXG4gIC8vIEJhc2UgYW5kIG1vZHVsdXMgYXJlIGV2ZW4sIHRocm93IGV4Y2VwdGlvblxuICBpZiAodGhpcy5pc0V2ZW4oKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkJpZ0ludGVnZXIgbm90IGludmVydGlibGUuXCIpO1xuXG4gIC8vIEdldCBldmVuIHBhcnQgb2YgbW9kdWx1cyBleHByZXNzZWQgYXMgYSBwb3dlciBvZiAyXG4gIHZhciBwb3dlcnNPZjIgPSBwLmdldExvd2VzdFNldEJpdCgpO1xuXG4gIC8vIC8vIENvbnN0cnVjdCBvZGQgcGFydCBvZiBtb2R1bHVzXG4gIHZhciBvZGRNb2QgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIocCk7XG4gIG9kZE1vZC5yaWdodFNoaWZ0KHBvd2Vyc09mMik7XG5cbiAgaWYgKG9kZE1vZC5pc09uZSgpKVxuICAgIHJldHVybiB0aGlzLm1vZEludmVyc2VNUDIocG93ZXJzT2YyKTtcblxuICAvLyBDYWxjdWxhdGUgMS9hIG1vZCBvZGRNb2RcbiAgdmFyIG9kZFBhcnQgPSB0aGlzLm1vZEludmVyc2Uob2RkTW9kKTtcblxuICAvLyBDYWxjdWxhdGUgMS9hIG1vZCBldmVuTW9kXG4gIHZhciBldmVuUGFydCA9IHRoaXMubW9kSW52ZXJzZU1QMihwb3dlcnNPZjIpO1xuXG4gIC8vIENvbWJpbmUgdGhlIHJlc3VsdHMgdXNpbmcgQ2hpbmVzZSBSZW1haW5kZXIgVGhlb3JlbVxuICB2YXIgeTEgPSB0aGlzLm1vZEludmVyc2VCUDIob2RkTW9kLCBwb3dlcnNPZjIpO1xuICB2YXIgeTIgPSBvZGRNb2QubW9kSW52ZXJzZU1QMihwb3dlcnNPZjIpO1xuXG4gIHZhciB0ZW1wMSA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcigpO1xuICB2YXIgdGVtcDIgPSBuZXcgTXV0YWJsZUJpZ0ludGVnZXIoKTtcbiAgdmFyIHJlc3VsdCA9IG5ldyBNdXRhYmxlQmlnSW50ZWdlcigpO1xuXG4gIG9kZFBhcnQubGVmdFNoaWZ0KHBvd2Vyc09mMik7XG4gIG9kZFBhcnQubXVsdGlwbHkoeTEsIHJlc3VsdCk7XG5cbiAgZXZlblBhcnQubXVsdGlwbHkob2RkTW9kLCB0ZW1wMSk7XG4gIHRlbXAxLm11bHRpcGx5KHkyLCB0ZW1wMik7XG5cbiAgcmVzdWx0LmFkZCh0ZW1wMik7XG4gIHJldHVybiByZXN1bHQuZGl2aWRlKHAsIHRlbXAxKTtcbn1cblxuLy8vL1xuXG5mdW5jdGlvbiBTaWduZWRNdXRhYmxlQmlnSW50ZWdlcih2YWwpIHtcbiAgaWYgKHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdGhpcy52YWx1ZSA9IFswXTtcbiAgICB0aGlzLmludExlbiA9IDA7XG4gIH0gZWxzZSBpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcbiAgICB0aGlzLnZhbHVlID0gWzBdO1xuICAgIHRoaXMuaW50TGVuID0gMTtcbiAgICB0aGlzLnZhbHVlWzBdID0gdmFsO1xuICB9XG4gIHRoaXMuc2lnbiA9IDE7XG4gIHRoaXMub2Zmc2V0ID0gMDtcbn1cblxudXRpbC5pbmhlcml0cyhTaWduZWRNdXRhYmxlQmlnSW50ZWdlciwgTXV0YWJsZUJpZ0ludGVnZXIpO1xuXG4vKipcbiAqIFNpZ25lZCBhZGRpdGlvbiBidWlsdCB1cG9uIHVuc2lnbmVkIGFkZCBhbmQgc3VidHJhY3QuXG4gKi9cblNpZ25lZE11dGFibGVCaWdJbnRlZ2VyLnByb3RvdHlwZS5zaWduZWRBZGQgPSBmdW5jdGlvbiAoYWRkZW5kKSB7XG4gIGlmIChhZGRlbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1NpZ25lZE11dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIGlmICh0aGlzLnNpZ24gPT0gYWRkZW5kLnNpZ24pXG4gICAgICB0aGlzLmFkZChhZGRlbmQpO1xuICAgIGVsc2VcbiAgICAgIHRoaXMuc2lnbiA9IHRoaXMuc2lnbiAqIHRoaXMuc3VidHJhY3QoYWRkZW5kKTtcbiAgfSBlbHNlIGlmIChhZGRlbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ011dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIGlmICh0aGlzLnNpZ24gPT0gMSlcbiAgICAgIHRoaXMuYWRkKGFkZGVuZCk7XG4gICAgZWxzZVxuICAgICAgdGhpcy5zaWduID0gdGhpcy5zaWduICogdGhpcy5zdWJ0cmFjdChhZGRlbmQpO1xuICB9XG59XG5cblxuU2lnbmVkTXV0YWJsZUJpZ0ludGVnZXIucHJvdG90eXBlLnNpZ25lZFN1YnRyYWN0ID0gZnVuY3Rpb24oYWRkZW5kKSB7XG4gIGlmIChhZGRlbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ1NpZ25lZE11dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIGlmICh0aGlzLnNpZ24gPT0gYWRkZW5kLnNpZ24pXG4gICAgICB0aGlzLnNpZ24gPSB0aGlzLnNpZ24gKiB0aGlzLnN1YnRyYWN0KGFkZGVuZCk7XG4gICAgZWxzZVxuICAgIHRoaXMuYWRkKGFkZGVuZCk7ICBcbiAgfSBlbHNlIGlmIChhZGRlbmQuY29uc3RydWN0b3IubmFtZSA9PT0gJ011dGFibGVCaWdJbnRlZ2VyJykge1xuICAgIGlmICh0aGlzLnNpZ24gPT0gMSlcbiAgICAgIHRoaXMuc2lnbiA9IHRoaXMuc2lnbiAqIHRoaXMuc3VidHJhY3QoYWRkZW5kKTtcbiAgICBlbHNlXG4gICAgICB0aGlzLmFkZChhZGRlbmQpO1xuICAgIGlmICh0aGlzLmludExlbiA9PSAwKVxuICAgICAgdGhpcy5zaWduID0gMTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11dGFibGVCaWdJbnRlZ2VyO1xuXG4iLCJ2YXIgTG9uZyA9IHJlcXVpcmUoJ2xvbmcnKTtcbnZhciBJbnRlZ2VyID0gcmVxdWlyZSgnLi9JbnRlZ2VyJyk7XG5cbmV4cG9ydHMuY29weU9mUmFuZ2UgPSBmdW5jdGlvbiAob3JpZ2luYWwsIGZyb20sIHRvKSB7XG4gIHZhciBuZXdMZW5ndGggPSB0byAtIGZyb207XG4gIGlmIChuZXdMZW5ndGggPCAwKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKGZyb20gKyBcIiA+IFwiICsgdG8pO1xuICB2YXIgY29weSA9IG5ldyBBcnJheShuZXdMZW5ndGgpO1xuICBhcnJheWNvcHkob3JpZ2luYWwsIGZyb20sIGNvcHksIDAsIE1hdGgubWluKG9yaWdpbmFsLmxlbmd0aCAtIGZyb20sIG5ld0xlbmd0aCkpO1xuICByZXR1cm4gY29weTtcbn1cblxudmFyIGFycmF5Y29weSA9IGV4cG9ydHMuYXJyYXljb3B5ID0gZnVuY3Rpb24gKHNyYywgc3JjUG9zLCBkZXN0LCBkZXN0UG9zLCBsZW5ndGgpIHtcbiAgZm9yICh2YXIgaSA9IHNyY1BvczsgaSA8IChzcmNQb3MgKyBsZW5ndGgpOyBpKyspIHtcbiAgICBkZXN0W2Rlc3RQb3MrK10gPSBzcmNbaV07XG4gIH1cbn07XG5cbnZhciBpbnRBcnJheSA9IGV4cG9ydHMuaW50QXJyYXkgPSBmdW5jdGlvbiAobGVuZ3RoKSB7XG4gIHZhciBhcnJheSA9IG5ldyBBcnJheShsZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgYXJyYXlbaV0gPSAwO1xuICB9XG4gIHJldHVybiBhcnJheTtcbn07XG5cbmV4cG9ydHMuY29weU9mID0gZnVuY3Rpb24gKG9yaWdpbmFsLCBuZXdMZW5ndGgpIHtcbiAgdmFyIGNvcHkgPSBpbnRBcnJheShuZXdMZW5ndGgpO1xuICBhcnJheWNvcHkob3JpZ2luYWwsIDAsIGNvcHksIDAsIE1hdGgubWluKG9yaWdpbmFsLmxlbmd0aCwgbmV3TGVuZ3RoKSk7XG4gIHJldHVybiBjb3B5O1xufVxuXG5leHBvcnRzLmxvbmdTdHJpbmcgPSBmdW5jdGlvbiAoaSwgcmFkaXgpIHtcbiAgaWYgKHJhZGl4IDwgMiB8fCByYWRpeCA+IDM2KVxuICAgIHJhZGl4ID0gMTA7XG4gIGlmIChyYWRpeCA9PT0gMTApXG4gICAgcmV0dXJuIGkudG9TdHJpbmcoKTtcbiAgdmFyIGJ1ZiA9IG5ldyBBcnJheSg2NSk7XG4gIHZhciBjaGFyUG9zID0gNjQ7XG4gIHZhciBuZWdhdGl2ZSA9IGkuY29tcGFyZShMb25nLlpFUk8pIDwgMDtcblxuICBpZiAoIW5lZ2F0aXZlKSB7XG4gICAgaSA9IGkubmVnYXRlKCk7XG4gIH1cbiAgcmFkaXggPSBMb25nLmZyb21JbnQocmFkaXgpO1xuICB2YXIgX3JhZGl4ID0gcmFkaXgubmVnYXRlKCk7XG4gIHdoaWxlIChpLmNvbXBhcmUoX3JhZGl4KSA8PSAwKSB7XG4gICAgdmFyIHJlbSA9IGkuc3VidHJhY3QoaS5kaXYocmFkaXgpLm11bHRpcGx5KHJhZGl4KSk7XG4gICAgYnVmW2NoYXJQb3MtLV0gPSBJbnRlZ2VyLmRpZ2l0c1tyZW0ubmVnYXRlKCkubG93XTtcbiAgICBpID0gaS5kaXYocmFkaXgpO1xuICB9XG4gIGJ1ZltjaGFyUG9zXSA9IEludGVnZXIuZGlnaXRzW2kubmVnYXRlKCkubG93XTtcblxuICBpZiAobmVnYXRpdmUpIHtcbiAgICBidWZbLS1jaGFyUG9zXSA9ICctJztcbiAgfVxuICByZXR1cm4gZXhwb3J0cy5jb3B5T2ZSYW5nZShidWYsIGNoYXJQb3MsIDY1KS5qb2luKCcnKTtcbn07XG5cbmV4cG9ydHMuZGVidWcgPSBmdW5jdGlvbiAoYSxiLGMsZCxlLGYpIHtcbiAgY29uc29sZS5sb2coYSxcbiAgICBKU09OLnN0cmluZ2lmeShiKSxcbiAgICBKU09OLnN0cmluZ2lmeShjKSxcbiAgICBKU09OLnN0cmluZ2lmeShkKSxcbiAgICBKU09OLnN0cmluZ2lmeShlKSxcbiAgICBKU09OLnN0cmluZ2lmeShmKVxuICApO1xufSIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG4vLyBzaGltIGZvciBOb2RlJ3MgJ3V0aWwnIHBhY2thZ2Vcbi8vIERPIE5PVCBSRU1PVkUgVEhJUyEgSXQgaXMgcmVxdWlyZWQgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBFbmRlckpTIChodHRwOi8vZW5kZXJqcy5jb20vKS5cbnZhciB1dGlsID0ge1xuICBpc0FycmF5OiBmdW5jdGlvbiAoYXIpIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShhcikgfHwgKHR5cGVvZiBhciA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcoYXIpID09PSAnW29iamVjdCBBcnJheV0nKTtcbiAgfSxcbiAgaXNEYXRlOiBmdW5jdGlvbiAoZCkge1xuICAgIHJldHVybiB0eXBlb2YgZCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbiAgfSxcbiAgaXNSZWdFeHA6IGZ1bmN0aW9uIChyZSkge1xuICAgIHJldHVybiB0eXBlb2YgcmUgPT09ICdvYmplY3QnICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG4gIH0sXG4gIGdldFJlZ0V4cEZsYWdzOiBmdW5jdGlvbiAocmUpIHtcbiAgICB2YXIgZmxhZ3MgPSAnJztcbiAgICByZS5nbG9iYWwgJiYgKGZsYWdzICs9ICdnJyk7XG4gICAgcmUuaWdub3JlQ2FzZSAmJiAoZmxhZ3MgKz0gJ2knKTtcbiAgICByZS5tdWx0aWxpbmUgJiYgKGZsYWdzICs9ICdtJyk7XG4gICAgcmV0dXJuIGZsYWdzO1xuICB9XG59O1xuXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JylcbiAgbW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcblxuLyoqXG4gKiBDbG9uZXMgKGNvcGllcykgYW4gT2JqZWN0IHVzaW5nIGRlZXAgY29weWluZy5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHN1cHBvcnRzIGNpcmN1bGFyIHJlZmVyZW5jZXMgYnkgZGVmYXVsdCwgYnV0IGlmIHlvdSBhcmUgY2VydGFpblxuICogdGhlcmUgYXJlIG5vIGNpcmN1bGFyIHJlZmVyZW5jZXMgaW4geW91ciBvYmplY3QsIHlvdSBjYW4gc2F2ZSBzb21lIENQVSB0aW1lXG4gKiBieSBjYWxsaW5nIGNsb25lKG9iaiwgZmFsc2UpLlxuICpcbiAqIENhdXRpb246IGlmIGBjaXJjdWxhcmAgaXMgZmFsc2UgYW5kIGBwYXJlbnRgIGNvbnRhaW5zIGNpcmN1bGFyIHJlZmVyZW5jZXMsXG4gKiB5b3VyIHByb2dyYW0gbWF5IGVudGVyIGFuIGluZmluaXRlIGxvb3AgYW5kIGNyYXNoLlxuICpcbiAqIEBwYXJhbSBgcGFyZW50YCAtIHRoZSBvYmplY3QgdG8gYmUgY2xvbmVkXG4gKiBAcGFyYW0gYGNpcmN1bGFyYCAtIHNldCB0byB0cnVlIGlmIHRoZSBvYmplY3QgdG8gYmUgY2xvbmVkIG1heSBjb250YWluXG4gKiAgICBjaXJjdWxhciByZWZlcmVuY2VzLiAob3B0aW9uYWwgLSB0cnVlIGJ5IGRlZmF1bHQpXG4gKiBAcGFyYW0gYGRlcHRoYCAtIHNldCB0byBhIG51bWJlciBpZiB0aGUgb2JqZWN0IGlzIG9ubHkgdG8gYmUgY2xvbmVkIHRvXG4gKiAgICBhIHBhcnRpY3VsYXIgZGVwdGguIChvcHRpb25hbCAtIGRlZmF1bHRzIHRvIEluZmluaXR5KVxuICogQHBhcmFtIGBwcm90b3R5cGVgIC0gc2V0cyB0aGUgcHJvdG90eXBlIHRvIGJlIHVzZWQgd2hlbiBjbG9uaW5nIGFuIG9iamVjdC5cbiAqICAgIChvcHRpb25hbCAtIGRlZmF1bHRzIHRvIHBhcmVudCBwcm90b3R5cGUpLlxuKi9cblxuZnVuY3Rpb24gY2xvbmUocGFyZW50LCBjaXJjdWxhciwgZGVwdGgsIHByb3RvdHlwZSkge1xuICAvLyBtYWludGFpbiB0d28gYXJyYXlzIGZvciBjaXJjdWxhciByZWZlcmVuY2VzLCB3aGVyZSBjb3JyZXNwb25kaW5nIHBhcmVudHNcbiAgLy8gYW5kIGNoaWxkcmVuIGhhdmUgdGhlIHNhbWUgaW5kZXhcbiAgdmFyIGFsbFBhcmVudHMgPSBbXTtcbiAgdmFyIGFsbENoaWxkcmVuID0gW107XG5cbiAgdmFyIHVzZUJ1ZmZlciA9IHR5cGVvZiBCdWZmZXIgIT0gJ3VuZGVmaW5lZCc7XG5cbiAgaWYgKHR5cGVvZiBjaXJjdWxhciA9PSAndW5kZWZpbmVkJylcbiAgICBjaXJjdWxhciA9IHRydWU7XG5cbiAgaWYgKHR5cGVvZiBkZXB0aCA9PSAndW5kZWZpbmVkJylcbiAgICBkZXB0aCA9IEluZmluaXR5O1xuXG4gIC8vIHJlY3Vyc2UgdGhpcyBmdW5jdGlvbiBzbyB3ZSBkb24ndCByZXNldCBhbGxQYXJlbnRzIGFuZCBhbGxDaGlsZHJlblxuICBmdW5jdGlvbiBfY2xvbmUocGFyZW50LCBkZXB0aCkge1xuICAgIC8vIGNsb25pbmcgbnVsbCBhbHdheXMgcmV0dXJucyBudWxsXG4gICAgaWYgKHBhcmVudCA9PT0gbnVsbClcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGRlcHRoID09IDApXG4gICAgICByZXR1cm4gcGFyZW50O1xuXG4gICAgdmFyIGNoaWxkO1xuICAgIHZhciBwcm90bztcbiAgICBpZiAodHlwZW9mIHBhcmVudCAhPSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHBhcmVudDtcbiAgICB9XG5cbiAgICBpZiAodXRpbC5pc0FycmF5KHBhcmVudCkpIHtcbiAgICAgIGNoaWxkID0gW107XG4gICAgfSBlbHNlIGlmICh1dGlsLmlzUmVnRXhwKHBhcmVudCkpIHtcbiAgICAgIGNoaWxkID0gbmV3IFJlZ0V4cChwYXJlbnQuc291cmNlLCB1dGlsLmdldFJlZ0V4cEZsYWdzKHBhcmVudCkpO1xuICAgICAgaWYgKHBhcmVudC5sYXN0SW5kZXgpIGNoaWxkLmxhc3RJbmRleCA9IHBhcmVudC5sYXN0SW5kZXg7XG4gICAgfSBlbHNlIGlmICh1dGlsLmlzRGF0ZShwYXJlbnQpKSB7XG4gICAgICBjaGlsZCA9IG5ldyBEYXRlKHBhcmVudC5nZXRUaW1lKCkpO1xuICAgIH0gZWxzZSBpZiAodXNlQnVmZmVyICYmIEJ1ZmZlci5pc0J1ZmZlcihwYXJlbnQpKSB7XG4gICAgICBjaGlsZCA9IG5ldyBCdWZmZXIocGFyZW50Lmxlbmd0aCk7XG4gICAgICBwYXJlbnQuY29weShjaGlsZCk7XG4gICAgICByZXR1cm4gY2hpbGQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0eXBlb2YgcHJvdG90eXBlID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHBhcmVudCk7XG4gICAgICAgIGNoaWxkID0gT2JqZWN0LmNyZWF0ZShwcm90byk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgY2hpbGQgPSBPYmplY3QuY3JlYXRlKHByb3RvdHlwZSk7XG4gICAgICAgIHByb3RvID0gcHJvdG90eXBlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaXJjdWxhcikge1xuICAgICAgdmFyIGluZGV4ID0gYWxsUGFyZW50cy5pbmRleE9mKHBhcmVudCk7XG5cbiAgICAgIGlmIChpbmRleCAhPSAtMSkge1xuICAgICAgICByZXR1cm4gYWxsQ2hpbGRyZW5baW5kZXhdO1xuICAgICAgfVxuICAgICAgYWxsUGFyZW50cy5wdXNoKHBhcmVudCk7XG4gICAgICBhbGxDaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpIGluIHBhcmVudCkge1xuICAgICAgdmFyIGF0dHJzO1xuICAgICAgaWYgKHByb3RvKSB7XG4gICAgICAgIGF0dHJzID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm90bywgaSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChhdHRycyAmJiBhdHRycy5zZXQgPT0gbnVsbCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNoaWxkW2ldID0gX2Nsb25lKHBhcmVudFtpXSwgZGVwdGggLSAxKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY2hpbGQ7XG4gIH1cblxuICByZXR1cm4gX2Nsb25lKHBhcmVudCwgZGVwdGgpO1xufVxuXG4vKipcbiAqIFNpbXBsZSBmbGF0IGNsb25lIHVzaW5nIHByb3RvdHlwZSwgYWNjZXB0cyBvbmx5IG9iamVjdHMsIHVzZWZ1bGwgZm9yIHByb3BlcnR5XG4gKiBvdmVycmlkZSBvbiBGTEFUIGNvbmZpZ3VyYXRpb24gb2JqZWN0IChubyBuZXN0ZWQgcHJvcHMpLlxuICpcbiAqIFVTRSBXSVRIIENBVVRJT04hIFRoaXMgbWF5IG5vdCBiZWhhdmUgYXMgeW91IHdpc2ggaWYgeW91IGRvIG5vdCBrbm93IGhvdyB0aGlzXG4gKiB3b3Jrcy5cbiAqL1xuY2xvbmUuY2xvbmVQcm90b3R5cGUgPSBmdW5jdGlvbihwYXJlbnQpIHtcbiAgaWYgKHBhcmVudCA9PT0gbnVsbClcbiAgICByZXR1cm4gbnVsbDtcblxuICB2YXIgYyA9IGZ1bmN0aW9uICgpIHt9O1xuICBjLnByb3RvdHlwZSA9IHBhcmVudDtcbiAgcmV0dXJuIG5ldyBjKCk7XG59O1xuIiwiLypcclxuIENvcHlyaWdodCAyMDEzIERhbmllbCBXaXJ0eiA8ZGNvZGVAZGNvZGUuaW8+XHJcbiBDb3B5cmlnaHQgMjAwOSBUaGUgQ2xvc3VyZSBMaWJyYXJ5IEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXHJcblxyXG4gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcclxuIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cclxuIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxyXG5cclxuIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxyXG5cclxuIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcclxuIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMtSVNcIiBCQVNJUyxcclxuIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxyXG4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxyXG4gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIEBsaWNlbnNlIExvbmcuanMgKGMpIDIwMTMgRGFuaWVsIFdpcnR6IDxkY29kZUBkY29kZS5pbz5cclxuICogUmVsZWFzZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMFxyXG4gKiBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9kY29kZUlPL0xvbmcuanMgZm9yIGRldGFpbHNcclxuICovXHJcbihmdW5jdGlvbihnbG9iYWwpIHtcclxuICAgIFwidXNlIHN0cmljdFwiO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29uc3RydWN0cyBhIDY0IGJpdCB0d28ncy1jb21wbGVtZW50IGludGVnZXIsIGdpdmVuIGl0cyBsb3cgYW5kIGhpZ2ggMzIgYml0IHZhbHVlcyBhcyAqc2lnbmVkKiBpbnRlZ2Vycy5cclxuICAgICAqICBTZWUgdGhlIGZyb20qIGZ1bmN0aW9ucyBiZWxvdyBmb3IgbW9yZSBjb252ZW5pZW50IHdheXMgb2YgY29uc3RydWN0aW5nIExvbmdzLlxyXG4gICAgICogQGV4cG9ydHMgTG9uZ1xyXG4gICAgICogQGNsYXNzIEEgTG9uZyBjbGFzcyBmb3IgcmVwcmVzZW50aW5nIGEgNjQgYml0IHR3bydzLWNvbXBsZW1lbnQgaW50ZWdlciB2YWx1ZS5cclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsb3cgVGhlIGxvdyAoc2lnbmVkKSAzMiBiaXRzIG9mIHRoZSBsb25nXHJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGlnaCBUaGUgaGlnaCAoc2lnbmVkKSAzMiBiaXRzIG9mIHRoZSBsb25nXHJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdCwgZGVmYXVsdHMgdG8gYGZhbHNlYCBmb3Igc2lnbmVkXHJcbiAgICAgKiBAY29uc3RydWN0b3JcclxuICAgICAqL1xyXG4gICAgdmFyIExvbmcgPSBmdW5jdGlvbihsb3csIGhpZ2gsIHVuc2lnbmVkKSB7XHJcblxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgICAqIFRoZSBsb3cgMzIgYml0cyBhcyBhIHNpZ25lZCB2YWx1ZS5cclxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxyXG4gICAgICAgICAqIEBleHBvc2VcclxuICAgICAgICAgKi9cclxuICAgICAgICB0aGlzLmxvdyA9IGxvd3wwO1xyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiBUaGUgaGlnaCAzMiBiaXRzIGFzIGEgc2lnbmVkIHZhbHVlLlxyXG4gICAgICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgICAgICogQGV4cG9zZVxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMuaGlnaCA9IGhpZ2h8MDtcclxuXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogV2hldGhlciB1bnNpZ25lZCBvciBub3QuXHJcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XHJcbiAgICAgICAgICogQGV4cG9zZVxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIHRoaXMudW5zaWduZWQgPSAhIXVuc2lnbmVkO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBUaGUgaW50ZXJuYWwgcmVwcmVzZW50YXRpb24gb2YgYSBsb25nIGlzIHRoZSB0d28gZ2l2ZW4gc2lnbmVkLCAzMi1iaXQgdmFsdWVzLlxyXG4gICAgLy8gV2UgdXNlIDMyLWJpdCBwaWVjZXMgYmVjYXVzZSB0aGVzZSBhcmUgdGhlIHNpemUgb2YgaW50ZWdlcnMgb24gd2hpY2hcclxuICAgIC8vIEphdmFzY3JpcHQgcGVyZm9ybXMgYml0LW9wZXJhdGlvbnMuICBGb3Igb3BlcmF0aW9ucyBsaWtlIGFkZGl0aW9uIGFuZFxyXG4gICAgLy8gbXVsdGlwbGljYXRpb24sIHdlIHNwbGl0IGVhY2ggbnVtYmVyIGludG8gMTYgYml0IHBpZWNlcywgd2hpY2ggY2FuIGVhc2lseSBiZVxyXG4gICAgLy8gbXVsdGlwbGllZCB3aXRoaW4gSmF2YXNjcmlwdCdzIGZsb2F0aW5nLXBvaW50IHJlcHJlc2VudGF0aW9uIHdpdGhvdXQgb3ZlcmZsb3dcclxuICAgIC8vIG9yIGNoYW5nZSBpbiBzaWduLlxyXG4gICAgLy9cclxuICAgIC8vIEluIHRoZSBhbGdvcml0aG1zIGJlbG93LCB3ZSBmcmVxdWVudGx5IHJlZHVjZSB0aGUgbmVnYXRpdmUgY2FzZSB0byB0aGVcclxuICAgIC8vIHBvc2l0aXZlIGNhc2UgYnkgbmVnYXRpbmcgdGhlIGlucHV0KHMpIGFuZCB0aGVuIHBvc3QtcHJvY2Vzc2luZyB0aGUgcmVzdWx0LlxyXG4gICAgLy8gTm90ZSB0aGF0IHdlIG11c3QgQUxXQVlTIGNoZWNrIHNwZWNpYWxseSB3aGV0aGVyIHRob3NlIHZhbHVlcyBhcmUgTUlOX1ZBTFVFXHJcbiAgICAvLyAoLTJeNjMpIGJlY2F1c2UgLU1JTl9WQUxVRSA9PSBNSU5fVkFMVUUgKHNpbmNlIDJeNjMgY2Fubm90IGJlIHJlcHJlc2VudGVkIGFzXHJcbiAgICAvLyBhIHBvc2l0aXZlIG51bWJlciwgaXQgb3ZlcmZsb3dzIGJhY2sgaW50byBhIG5lZ2F0aXZlKS4gIE5vdCBoYW5kbGluZyB0aGlzXHJcbiAgICAvLyBjYXNlIHdvdWxkIG9mdGVuIHJlc3VsdCBpbiBpbmZpbml0ZSByZWN1cnNpb24uXHJcbiAgICAvL1xyXG4gICAgLy8gQ29tbW9uIGNvbnN0YW50IHZhbHVlcyBaRVJPLCBPTkUsIE5FR19PTkUsIGV0Yy4gYXJlIGRlZmluZWQgYmVsb3cgdGhlIGZyb20qXHJcbiAgICAvLyBtZXRob2RzIG9uIHdoaWNoIHRoZXkgZGVwZW5kLlxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGVzdHMgaWYgdGhlIHNwZWNpZmllZCBvYmplY3QgaXMgYSBMb25nLlxyXG4gICAgICogQHBhcmFtIHsqfSBvYmogT2JqZWN0XHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5pc0xvbmcgPSBmdW5jdGlvbihvYmopIHtcclxuICAgICAgICByZXR1cm4gKG9iaiAmJiBvYmogaW5zdGFuY2VvZiBMb25nKSA9PT0gdHJ1ZTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBIGNhY2hlIG9mIHRoZSBMb25nIHJlcHJlc2VudGF0aW9ucyBvZiBzbWFsbCBpbnRlZ2VyIHZhbHVlcy5cclxuICAgICAqIEB0eXBlIHshT2JqZWN0fVxyXG4gICAgICogQGlubmVyXHJcbiAgICAgKi9cclxuICAgIHZhciBJTlRfQ0FDSEUgPSB7fTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEEgY2FjaGUgb2YgdGhlIExvbmcgcmVwcmVzZW50YXRpb25zIG9mIHNtYWxsIHVuc2lnbmVkIGludGVnZXIgdmFsdWVzLlxyXG4gICAgICogQHR5cGUgeyFPYmplY3R9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFVJTlRfQ0FDSEUgPSB7fTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYSBMb25nIHJlcHJlc2VudGluZyB0aGUgZ2l2ZW4gMzIgYml0IGludGVnZXIgdmFsdWUuXHJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIDMyIGJpdCBpbnRlZ2VyIGluIHF1ZXN0aW9uXHJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdCwgZGVmYXVsdHMgdG8gYGZhbHNlYCBmb3Igc2lnbmVkXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWVcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5mcm9tSW50ID0gZnVuY3Rpb24odmFsdWUsIHVuc2lnbmVkKSB7XHJcbiAgICAgICAgdmFyIG9iaiwgY2FjaGVkT2JqO1xyXG4gICAgICAgIGlmICghdW5zaWduZWQpIHtcclxuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSB8IDA7XHJcbiAgICAgICAgICAgIGlmICgtMTI4IDw9IHZhbHVlICYmIHZhbHVlIDwgMTI4KSB7XHJcbiAgICAgICAgICAgICAgICBjYWNoZWRPYmogPSBJTlRfQ0FDSEVbdmFsdWVdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlZE9iailcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FjaGVkT2JqO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG9iaiA9IG5ldyBMb25nKHZhbHVlLCB2YWx1ZSA8IDAgPyAtMSA6IDAsIGZhbHNlKTtcclxuICAgICAgICAgICAgaWYgKC0xMjggPD0gdmFsdWUgJiYgdmFsdWUgPCAxMjgpXHJcbiAgICAgICAgICAgICAgICBJTlRfQ0FDSEVbdmFsdWVdID0gb2JqO1xyXG4gICAgICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgPj4+IDA7XHJcbiAgICAgICAgICAgIGlmICgwIDw9IHZhbHVlICYmIHZhbHVlIDwgMjU2KSB7XHJcbiAgICAgICAgICAgICAgICBjYWNoZWRPYmogPSBVSU5UX0NBQ0hFW3ZhbHVlXTtcclxuICAgICAgICAgICAgICAgIGlmIChjYWNoZWRPYmopXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhY2hlZE9iajtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvYmogPSBuZXcgTG9uZyh2YWx1ZSwgKHZhbHVlIHwgMCkgPCAwID8gLTEgOiAwLCB0cnVlKTtcclxuICAgICAgICAgICAgaWYgKDAgPD0gdmFsdWUgJiYgdmFsdWUgPCAyNTYpXHJcbiAgICAgICAgICAgICAgICBVSU5UX0NBQ0hFW3ZhbHVlXSA9IG9iajtcclxuICAgICAgICAgICAgcmV0dXJuIG9iajtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyBhIExvbmcgcmVwcmVzZW50aW5nIHRoZSBnaXZlbiB2YWx1ZSwgcHJvdmlkZWQgdGhhdCBpdCBpcyBhIGZpbml0ZSBudW1iZXIuIE90aGVyd2lzZSwgemVybyBpcyByZXR1cm5lZC5cclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSBUaGUgbnVtYmVyIGluIHF1ZXN0aW9uXHJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdCwgZGVmYXVsdHMgdG8gYGZhbHNlYCBmb3Igc2lnbmVkXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWVcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5mcm9tTnVtYmVyID0gZnVuY3Rpb24odmFsdWUsIHVuc2lnbmVkKSB7XHJcbiAgICAgICAgdW5zaWduZWQgPSAhIXVuc2lnbmVkO1xyXG4gICAgICAgIGlmIChpc05hTih2YWx1ZSkgfHwgIWlzRmluaXRlKHZhbHVlKSlcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuWkVSTztcclxuICAgICAgICBpZiAoIXVuc2lnbmVkICYmIHZhbHVlIDw9IC1UV09fUFdSXzYzX0RCTClcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuTUlOX1ZBTFVFO1xyXG4gICAgICAgIGlmICghdW5zaWduZWQgJiYgdmFsdWUgKyAxID49IFRXT19QV1JfNjNfREJMKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NQVhfVkFMVUU7XHJcbiAgICAgICAgaWYgKHVuc2lnbmVkICYmIHZhbHVlID49IFRXT19QV1JfNjRfREJMKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NQVhfVU5TSUdORURfVkFMVUU7XHJcbiAgICAgICAgaWYgKHZhbHVlIDwgMClcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbU51bWJlcigtdmFsdWUsIHVuc2lnbmVkKS5uZWdhdGUoKTtcclxuICAgICAgICByZXR1cm4gbmV3IExvbmcoKHZhbHVlICUgVFdPX1BXUl8zMl9EQkwpIHwgMCwgKHZhbHVlIC8gVFdPX1BXUl8zMl9EQkwpIHwgMCwgdW5zaWduZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYSBMb25nIHJlcHJlc2VudGluZyB0aGUgNjQgYml0IGludGVnZXIgdGhhdCBjb21lcyBieSBjb25jYXRlbmF0aW5nIHRoZSBnaXZlbiBsb3cgYW5kIGhpZ2ggYml0cy4gRWFjaCBpc1xyXG4gICAgICogIGFzc3VtZWQgdG8gdXNlIDMyIGJpdHMuXHJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbG93Qml0cyBUaGUgbG93IDMyIGJpdHNcclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBoaWdoQml0cyBUaGUgaGlnaCAzMiBiaXRzXHJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdCwgZGVmYXVsdHMgdG8gYGZhbHNlYCBmb3Igc2lnbmVkXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWVcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5mcm9tQml0cyA9IGZ1bmN0aW9uKGxvd0JpdHMsIGhpZ2hCaXRzLCB1bnNpZ25lZCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgTG9uZyhsb3dCaXRzLCBoaWdoQml0cywgdW5zaWduZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgYSBMb25nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBzdHJpbmcsIHdyaXR0ZW4gdXNpbmcgdGhlIHNwZWNpZmllZCByYWRpeC5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgVGhlIHRleHR1YWwgcmVwcmVzZW50YXRpb24gb2YgdGhlIExvbmdcclxuICAgICAqIEBwYXJhbSB7KGJvb2xlYW58bnVtYmVyKT19IHVuc2lnbmVkIFdoZXRoZXIgdW5zaWduZWQgb3Igbm90LCBkZWZhdWx0cyB0byBgZmFsc2VgIGZvciBzaWduZWRcclxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0gcmFkaXggVGhlIHJhZGl4IGluIHdoaWNoIHRoZSB0ZXh0IGlzIHdyaXR0ZW4gKDItMzYpLCBkZWZhdWx0cyB0byAxMFxyXG4gICAgICogQHJldHVybnMgeyFMb25nfSBUaGUgY29ycmVzcG9uZGluZyBMb25nIHZhbHVlXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcuZnJvbVN0cmluZyA9IGZ1bmN0aW9uKHN0ciwgdW5zaWduZWQsIHJhZGl4KSB7XHJcbiAgICAgICAgaWYgKHN0ci5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdudW1iZXIgZm9ybWF0IGVycm9yOiBlbXB0eSBzdHJpbmcnKTtcclxuICAgICAgICBpZiAoc3RyID09PSBcIk5hTlwiIHx8IHN0ciA9PT0gXCJJbmZpbml0eVwiIHx8IHN0ciA9PT0gXCIrSW5maW5pdHlcIiB8fCBzdHIgPT09IFwiLUluZmluaXR5XCIpXHJcbiAgICAgICAgICAgIHJldHVybiBMb25nLlpFUk87XHJcbiAgICAgICAgaWYgKHR5cGVvZiB1bnNpZ25lZCA9PT0gJ251bWJlcicpIC8vIEZvciBnb29nLm1hdGgubG9uZyBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgICAgIHJhZGl4ID0gdW5zaWduZWQsXHJcbiAgICAgICAgICAgIHVuc2lnbmVkID0gZmFsc2U7XHJcbiAgICAgICAgcmFkaXggPSByYWRpeCB8fCAxMDtcclxuICAgICAgICBpZiAocmFkaXggPCAyIHx8IDM2IDwgcmFkaXgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdyYWRpeCBvdXQgb2YgcmFuZ2U6ICcgKyByYWRpeCk7XHJcblxyXG4gICAgICAgIHZhciBwO1xyXG4gICAgICAgIGlmICgocCA9IHN0ci5pbmRleE9mKCctJykpID4gMClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ251bWJlciBmb3JtYXQgZXJyb3I6IGludGVyaW9yIFwiLVwiIGNoYXJhY3RlcjogJyArIHN0cik7XHJcbiAgICAgICAgZWxzZSBpZiAocCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbVN0cmluZyhzdHIuc3Vic3RyaW5nKDEpLCB1bnNpZ25lZCwgcmFkaXgpLm5lZ2F0ZSgpO1xyXG5cclxuICAgICAgICAvLyBEbyBzZXZlcmFsICg4KSBkaWdpdHMgZWFjaCB0aW1lIHRocm91Z2ggdGhlIGxvb3AsIHNvIGFzIHRvXHJcbiAgICAgICAgLy8gbWluaW1pemUgdGhlIGNhbGxzIHRvIHRoZSB2ZXJ5IGV4cGVuc2l2ZSBlbXVsYXRlZCBkaXYuXHJcbiAgICAgICAgdmFyIHJhZGl4VG9Qb3dlciA9IExvbmcuZnJvbU51bWJlcihNYXRoLnBvdyhyYWRpeCwgOCkpO1xyXG5cclxuICAgICAgICB2YXIgcmVzdWx0ID0gTG9uZy5aRVJPO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSArPSA4KSB7XHJcbiAgICAgICAgICAgIHZhciBzaXplID0gTWF0aC5taW4oOCwgc3RyLmxlbmd0aCAtIGkpO1xyXG4gICAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKGksIGkgKyBzaXplKSwgcmFkaXgpO1xyXG4gICAgICAgICAgICBpZiAoc2l6ZSA8IDgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBwb3dlciA9IExvbmcuZnJvbU51bWJlcihNYXRoLnBvdyhyYWRpeCwgc2l6ZSkpO1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0Lm11bHRpcGx5KHBvd2VyKS5hZGQoTG9uZy5mcm9tTnVtYmVyKHZhbHVlKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQubXVsdGlwbHkocmFkaXhUb1Bvd2VyKTtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5hZGQoTG9uZy5mcm9tTnVtYmVyKHZhbHVlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzdWx0LnVuc2lnbmVkID0gdW5zaWduZWQ7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgc3BlY2lmaWVkIHZhbHVlIHRvIGEgTG9uZy5cclxuICAgICAqIEBwYXJhbSB7IUxvbmd8bnVtYmVyfHN0cmluZ3whe2xvdzogbnVtYmVyLCBoaWdoOiBudW1iZXIsIHVuc2lnbmVkOiBib29sZWFufX0gdmFsIFZhbHVlXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcuZnJvbVZhbHVlID0gZnVuY3Rpb24odmFsKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tTnVtYmVyKHZhbCk7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tU3RyaW5nKHZhbCk7XHJcbiAgICAgICAgaWYgKExvbmcuaXNMb25nKHZhbCkpXHJcbiAgICAgICAgICAgIHJldHVybiB2YWw7XHJcbiAgICAgICAgLy8gVGhyb3dzIGZvciBub3QgYW4gb2JqZWN0ICh1bmRlZmluZWQsIG51bGwpOlxyXG4gICAgICAgIHJldHVybiBuZXcgTG9uZyh2YWwubG93LCB2YWwuaGlnaCwgdmFsLnVuc2lnbmVkKTtcclxuICAgIH07XHJcblxyXG4gICAgLy8gTk9URTogdGhlIGNvbXBpbGVyIHNob3VsZCBpbmxpbmUgdGhlc2UgY29uc3RhbnQgdmFsdWVzIGJlbG93IGFuZCB0aGVuIHJlbW92ZSB0aGVzZSB2YXJpYWJsZXMsIHNvIHRoZXJlIHNob3VsZCBiZVxyXG4gICAgLy8gbm8gcnVudGltZSBwZW5hbHR5IGZvciB0aGVzZS5cclxuXHJcbiAgICAvKipcclxuICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFRXT19QV1JfMTZfREJMID0gMSA8PCAxNjtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFRXT19QV1JfMjRfREJMID0gMSA8PCAyNDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFRXT19QV1JfMzJfREJMID0gVFdPX1BXUl8xNl9EQkwgKiBUV09fUFdSXzE2X0RCTDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFRXT19QV1JfMzFfREJMID0gVFdPX1BXUl8zMl9EQkwgLyAyO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHR5cGUge251bWJlcn1cclxuICAgICAqIEBpbm5lclxyXG4gICAgICovXHJcbiAgICB2YXIgVFdPX1BXUl80OF9EQkwgPSBUV09fUFdSXzMyX0RCTCAqIFRXT19QV1JfMTZfREJMO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHR5cGUge251bWJlcn1cclxuICAgICAqIEBpbm5lclxyXG4gICAgICovXHJcbiAgICB2YXIgVFdPX1BXUl82NF9EQkwgPSBUV09fUFdSXzMyX0RCTCAqIFRXT19QV1JfMzJfREJMO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHR5cGUge251bWJlcn1cclxuICAgICAqIEBpbm5lclxyXG4gICAgICovXHJcbiAgICB2YXIgVFdPX1BXUl82M19EQkwgPSBUV09fUFdSXzY0X0RCTCAvIDI7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBAdHlwZSB7IUxvbmd9XHJcbiAgICAgKiBAaW5uZXJcclxuICAgICAqL1xyXG4gICAgdmFyIFRXT19QV1JfMjQgPSBMb25nLmZyb21JbnQoMSA8PCAyNCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTaWduZWQgemVyby5cclxuICAgICAqIEB0eXBlIHshTG9uZ31cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5aRVJPID0gTG9uZy5mcm9tSW50KDApO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVW5zaWduZWQgemVyby5cclxuICAgICAqIEB0eXBlIHshTG9uZ31cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5VWkVSTyA9IExvbmcuZnJvbUludCgwLCB0cnVlKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFNpZ25lZCBvbmUuXHJcbiAgICAgKiBAdHlwZSB7IUxvbmd9XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcuT05FID0gTG9uZy5mcm9tSW50KDEpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVW5zaWduZWQgb25lLlxyXG4gICAgICogQHR5cGUgeyFMb25nfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLlVPTkUgPSBMb25nLmZyb21JbnQoMSwgdHJ1ZSk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTaWduZWQgbmVnYXRpdmUgb25lLlxyXG4gICAgICogQHR5cGUgeyFMb25nfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLk5FR19PTkUgPSBMb25nLmZyb21JbnQoLTEpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogTWF4aW11bSBzaWduZWQgdmFsdWUuXHJcbiAgICAgKiBAdHlwZSB7IUxvbmd9XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcuTUFYX1ZBTFVFID0gTG9uZy5mcm9tQml0cygweEZGRkZGRkZGfDAsIDB4N0ZGRkZGRkZ8MCwgZmFsc2UpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogTWF4aW11bSB1bnNpZ25lZCB2YWx1ZS5cclxuICAgICAqIEB0eXBlIHshTG9uZ31cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5NQVhfVU5TSUdORURfVkFMVUUgPSBMb25nLmZyb21CaXRzKDB4RkZGRkZGRkZ8MCwgMHhGRkZGRkZGRnwwLCB0cnVlKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIE1pbmltdW0gc2lnbmVkIHZhbHVlLlxyXG4gICAgICogQHR5cGUgeyFMb25nfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLk1JTl9WQUxVRSA9IExvbmcuZnJvbUJpdHMoMCwgMHg4MDAwMDAwMHwwLCBmYWxzZSk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgTG9uZyB0byBhIDMyIGJpdCBpbnRlZ2VyLCBhc3N1bWluZyBpdCBpcyBhIDMyIGJpdCBpbnRlZ2VyLlxyXG4gICAgICogQHJldHVybnMge251bWJlcn1cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUudG9JbnQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy51bnNpZ25lZCA/IHRoaXMubG93ID4+PiAwIDogdGhpcy5sb3c7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIExvbmcgdG8gYSB0aGUgbmVhcmVzdCBmbG9hdGluZy1wb2ludCByZXByZXNlbnRhdGlvbiBvZiB0aGlzIHZhbHVlIChkb3VibGUsIDUzIGJpdCBtYW50aXNzYSkuXHJcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS50b051bWJlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnVuc2lnbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAoKHRoaXMuaGlnaCA+Pj4gMCkgKiBUV09fUFdSXzMyX0RCTCkgKyAodGhpcy5sb3cgPj4+IDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5oaWdoICogVFdPX1BXUl8zMl9EQkwgKyAodGhpcy5sb3cgPj4+IDApO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBMb25nIHRvIGEgc3RyaW5nIHdyaXR0ZW4gaW4gdGhlIHNwZWNpZmllZCByYWRpeC5cclxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0gcmFkaXggUmFkaXggKDItMzYpLCBkZWZhdWx0cyB0byAxMFxyXG4gICAgICogQHJldHVybnMge3N0cmluZ31cclxuICAgICAqIEBvdmVycmlkZVxyXG4gICAgICogQHRocm93cyB7UmFuZ2VFcnJvcn0gSWYgYHJhZGl4YCBpcyBvdXQgb2YgcmFuZ2VcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbihyYWRpeCkge1xyXG4gICAgICAgIHJhZGl4ID0gcmFkaXggfHwgMTA7XHJcbiAgICAgICAgaWYgKHJhZGl4IDwgMiB8fCAzNiA8IHJhZGl4KVxyXG4gICAgICAgICAgICB0aHJvdyBSYW5nZUVycm9yKCdyYWRpeCBvdXQgb2YgcmFuZ2U6ICcgKyByYWRpeCk7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNaZXJvKCkpXHJcbiAgICAgICAgICAgIHJldHVybiAnMCc7XHJcbiAgICAgICAgdmFyIHJlbTtcclxuICAgICAgICBpZiAodGhpcy5pc05lZ2F0aXZlKCkpIHsgLy8gVW5zaWduZWQgTG9uZ3MgYXJlIG5ldmVyIG5lZ2F0aXZlXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmVxdWFscyhMb25nLk1JTl9WQUxVRSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBMb25nIHZhbHVlIGJlZm9yZSBpdCBjYW4gYmUgbmVnYXRlZCwgc28gd2UgcmVtb3ZlXHJcbiAgICAgICAgICAgICAgICAvLyB0aGUgYm90dG9tLW1vc3QgZGlnaXQgaW4gdGhpcyBiYXNlIGFuZCB0aGVuIHJlY3Vyc2UgdG8gZG8gdGhlIHJlc3QuXHJcbiAgICAgICAgICAgICAgICB2YXIgcmFkaXhMb25nID0gTG9uZy5mcm9tTnVtYmVyKHJhZGl4KTtcclxuICAgICAgICAgICAgICAgIHZhciBkaXYgPSB0aGlzLmRpdihyYWRpeExvbmcpO1xyXG4gICAgICAgICAgICAgICAgcmVtID0gZGl2Lm11bHRpcGx5KHJhZGl4TG9uZykuc3VidHJhY3QodGhpcyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZGl2LnRvU3RyaW5nKHJhZGl4KSArIHJlbS50b0ludCgpLnRvU3RyaW5nKHJhZGl4KTtcclxuICAgICAgICAgICAgfSBlbHNlXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gJy0nICsgdGhpcy5uZWdhdGUoKS50b1N0cmluZyhyYWRpeCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEbyBzZXZlcmFsICg2KSBkaWdpdHMgZWFjaCB0aW1lIHRocm91Z2ggdGhlIGxvb3AsIHNvIGFzIHRvXHJcbiAgICAgICAgLy8gbWluaW1pemUgdGhlIGNhbGxzIHRvIHRoZSB2ZXJ5IGV4cGVuc2l2ZSBlbXVsYXRlZCBkaXYuXHJcbiAgICAgICAgdmFyIHJhZGl4VG9Qb3dlciA9IExvbmcuZnJvbU51bWJlcihNYXRoLnBvdyhyYWRpeCwgNiksIHRoaXMudW5zaWduZWQpO1xyXG4gICAgICAgIHJlbSA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9ICcnO1xyXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgICAgIHZhciByZW1EaXYgPSByZW0uZGl2KHJhZGl4VG9Qb3dlciksXHJcbiAgICAgICAgICAgICAgICBpbnR2YWwgPSByZW0uc3VidHJhY3QocmVtRGl2Lm11bHRpcGx5KHJhZGl4VG9Qb3dlcikpLnRvSW50KCkgPj4+IDAsXHJcbiAgICAgICAgICAgICAgICBkaWdpdHMgPSBpbnR2YWwudG9TdHJpbmcocmFkaXgpO1xyXG4gICAgICAgICAgICByZW0gPSByZW1EaXY7XHJcbiAgICAgICAgICAgIGlmIChyZW0uaXNaZXJvKCkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZGlnaXRzICsgcmVzdWx0O1xyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHdoaWxlIChkaWdpdHMubGVuZ3RoIDwgNilcclxuICAgICAgICAgICAgICAgICAgICBkaWdpdHMgPSAnMCcgKyBkaWdpdHM7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSAnJyArIGRpZ2l0cyArIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBoaWdoIDMyIGJpdHMgYXMgYSBzaWduZWQgaW50ZWdlci5cclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IFNpZ25lZCBoaWdoIGJpdHNcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZ2V0SGlnaEJpdHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5oaWdoO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGhpZ2ggMzIgYml0cyBhcyBhbiB1bnNpZ25lZCBpbnRlZ2VyLlxyXG4gICAgICogQHJldHVybnMge251bWJlcn0gVW5zaWduZWQgaGlnaCBiaXRzXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLmdldEhpZ2hCaXRzVW5zaWduZWQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5oaWdoID4+PiAwO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGxvdyAzMiBiaXRzIGFzIGEgc2lnbmVkIGludGVnZXIuXHJcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBTaWduZWQgbG93IGJpdHNcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZ2V0TG93Qml0cyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmxvdztcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBsb3cgMzIgYml0cyBhcyBhbiB1bnNpZ25lZCBpbnRlZ2VyLlxyXG4gICAgICogQHJldHVybnMge251bWJlcn0gVW5zaWduZWQgbG93IGJpdHNcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZ2V0TG93Qml0c1Vuc2lnbmVkID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubG93ID4+PiAwO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIG51bWJlciBvZiBiaXRzIG5lZWRlZCB0byByZXByZXNlbnQgdGhlIGFic29sdXRlIHZhbHVlIG9mIHRoaXMgTG9uZy5cclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLmdldE51bUJpdHNBYnMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZiAodGhpcy5pc05lZ2F0aXZlKCkpIC8vIFVuc2lnbmVkIExvbmdzIGFyZSBuZXZlciBuZWdhdGl2ZVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lcXVhbHMoTG9uZy5NSU5fVkFMVUUpID8gNjQgOiB0aGlzLm5lZ2F0ZSgpLmdldE51bUJpdHNBYnMoKTtcclxuICAgICAgICB2YXIgdmFsID0gdGhpcy5oaWdoICE9IDAgPyB0aGlzLmhpZ2ggOiB0aGlzLmxvdztcclxuICAgICAgICBmb3IgKHZhciBiaXQgPSAzMTsgYml0ID4gMDsgYml0LS0pXHJcbiAgICAgICAgICAgIGlmICgodmFsICYgKDEgPDwgYml0KSkgIT0gMClcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhpZ2ggIT0gMCA/IGJpdCArIDMzIDogYml0ICsgMTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUZXN0cyBpZiB0aGlzIExvbmcncyB2YWx1ZSBlcXVhbHMgemVyby5cclxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5pc1plcm8gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5oaWdoID09PSAwICYmIHRoaXMubG93ID09PSAwO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlc3RzIGlmIHRoaXMgTG9uZydzIHZhbHVlIGlzIG5lZ2F0aXZlLlxyXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLmlzTmVnYXRpdmUgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gIXRoaXMudW5zaWduZWQgJiYgdGhpcy5oaWdoIDwgMDtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUZXN0cyBpZiB0aGlzIExvbmcncyB2YWx1ZSBpcyBwb3NpdGl2ZS5cclxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5pc1Bvc2l0aXZlID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudW5zaWduZWQgfHwgdGhpcy5oaWdoID49IDA7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGVzdHMgaWYgdGhpcyBMb25nJ3MgdmFsdWUgaXMgb2RkLlxyXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLmlzT2RkID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLmxvdyAmIDEpID09PSAxO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlc3RzIGlmIHRoaXMgTG9uZydzIHZhbHVlIGlzIGV2ZW4uXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuaXNFdmVuID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLmxvdyAmIDEpID09PSAwO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlc3RzIGlmIHRoaXMgTG9uZydzIHZhbHVlIGVxdWFscyB0aGUgc3BlY2lmaWVkJ3MuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IG90aGVyIE90aGVyIHZhbHVlXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24ob3RoZXIpIHtcclxuICAgICAgICBpZiAoIUxvbmcuaXNMb25nKG90aGVyKSlcclxuICAgICAgICAgICAgb3RoZXIgPSBMb25nLmZyb21WYWx1ZShvdGhlcik7XHJcbiAgICAgICAgaWYgKHRoaXMudW5zaWduZWQgIT09IG90aGVyLnVuc2lnbmVkICYmICh0aGlzLmhpZ2ggPj4+IDMxKSAhPT0gKG90aGVyLmhpZ2ggPj4+IDMxKSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhpZ2ggPT09IG90aGVyLmhpZ2ggJiYgdGhpcy5sb3cgPT09IG90aGVyLmxvdztcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUZXN0cyBpZiB0aGlzIExvbmcncyB2YWx1ZSBkaWZmZXJzIGZyb20gdGhlIHNwZWNpZmllZCdzLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBvdGhlciBPdGhlciB2YWx1ZVxyXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLm5vdEVxdWFscyA9IGZ1bmN0aW9uKG90aGVyKSB7XHJcbiAgICAgICAgaWYgKCFMb25nLmlzTG9uZyhvdGhlcikpXHJcbiAgICAgICAgICAgIG90aGVyID0gTG9uZy5mcm9tVmFsdWUob3RoZXIpO1xyXG4gICAgICAgIHJldHVybiAhdGhpcy5lcXVhbHMob3RoZXIpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlc3RzIGlmIHRoaXMgTG9uZydzIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgc3BlY2lmaWVkJ3MuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IG90aGVyIE90aGVyIHZhbHVlXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUubGVzc1RoYW4gPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcob3RoZXIpKVxyXG4gICAgICAgICAgICBvdGhlciA9IExvbmcuZnJvbVZhbHVlKG90aGVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb21wYXJlKG90aGVyKSA8IDA7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGVzdHMgaWYgdGhpcyBMb25nJ3MgdmFsdWUgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRoZSBzcGVjaWZpZWQncy5cclxuICAgICAqIEBwYXJhbSB7IUxvbmd8bnVtYmVyfHN0cmluZ30gb3RoZXIgT3RoZXIgdmFsdWVcclxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5sZXNzVGhhbk9yRXF1YWwgPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcob3RoZXIpKVxyXG4gICAgICAgICAgICBvdGhlciA9IExvbmcuZnJvbVZhbHVlKG90aGVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb21wYXJlKG90aGVyKSA8PSAwO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRlc3RzIGlmIHRoaXMgTG9uZydzIHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgc3BlY2lmaWVkJ3MuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IG90aGVyIE90aGVyIHZhbHVlXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZ3JlYXRlclRoYW4gPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcob3RoZXIpKVxyXG4gICAgICAgICAgICBvdGhlciA9IExvbmcuZnJvbVZhbHVlKG90aGVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb21wYXJlKG90aGVyKSA+IDA7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGVzdHMgaWYgdGhpcyBMb25nJ3MgdmFsdWUgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRoZSBzcGVjaWZpZWQncy5cclxuICAgICAqIEBwYXJhbSB7IUxvbmd8bnVtYmVyfHN0cmluZ30gb3RoZXIgT3RoZXIgdmFsdWVcclxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5ncmVhdGVyVGhhbk9yRXF1YWwgPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbXBhcmUob3RoZXIpID49IDA7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29tcGFyZXMgdGhpcyBMb25nJ3MgdmFsdWUgd2l0aCB0aGUgc3BlY2lmaWVkJ3MuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IG90aGVyIE90aGVyIHZhbHVlXHJcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAwIGlmIHRoZXkgYXJlIHRoZSBzYW1lLCAxIGlmIHRoZSB0aGlzIGlzIGdyZWF0ZXIgYW5kIC0xXHJcbiAgICAgKiAgaWYgdGhlIGdpdmVuIG9uZSBpcyBncmVhdGVyXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmVxdWFscyhvdGhlcikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciB0aGlzTmVnID0gdGhpcy5pc05lZ2F0aXZlKCk7XHJcbiAgICAgICAgdmFyIG90aGVyTmVnID0gb3RoZXIuaXNOZWdhdGl2ZSgpO1xyXG4gICAgICAgIGlmICh0aGlzTmVnICYmICFvdGhlck5lZykgcmV0dXJuIC0xO1xyXG4gICAgICAgIGlmICghdGhpc05lZyAmJiBvdGhlck5lZykgcmV0dXJuIDE7XHJcbiAgICAgICAgLy8gQXQgdGhpcyBwb2ludCB0aGUgc2lnbiBiaXRzIGFyZSB0aGUgc2FtZVxyXG4gICAgICAgIGlmICghdGhpcy51bnNpZ25lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3VidHJhY3Qob3RoZXIpLmlzTmVnYXRpdmUoKSA/IC0xIDogMTtcclxuICAgICAgICAvLyBCb3RoIGFyZSBwb3NpdGl2ZSBpZiBhdCBsZWFzdCBvbmUgaXMgdW5zaWduZWRcclxuICAgICAgICByZXR1cm4gKG90aGVyLmhpZ2ggPj4+IDApID4gKHRoaXMuaGlnaCA+Pj4gMCkgfHwgKG90aGVyLmhpZ2ggPT09IHRoaXMuaGlnaCAmJiAob3RoZXIubG93ID4+PiAwKSA+ICh0aGlzLmxvdyA+Pj4gMCkpID8gLTEgOiAxO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIE5lZ2F0ZXMgdGhpcyBMb25nJ3MgdmFsdWUuXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IE5lZ2F0ZWQgTG9uZ1xyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5uZWdhdGUgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMudW5zaWduZWQgJiYgdGhpcy5lcXVhbHMoTG9uZy5NSU5fVkFMVUUpKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NSU5fVkFMVUU7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubm90KCkuYWRkKExvbmcuT05FKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhpcyBhbmQgdGhlIHNwZWNpZmllZCBMb25nLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBhZGRlbmQgQWRkZW5kXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IFN1bVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihhZGRlbmQpIHtcclxuICAgICAgICBpZiAoIUxvbmcuaXNMb25nKGFkZGVuZCkpXHJcbiAgICAgICAgICAgIGFkZGVuZCA9IExvbmcuZnJvbVZhbHVlKGFkZGVuZCk7XHJcblxyXG4gICAgICAgIC8vIERpdmlkZSBlYWNoIG51bWJlciBpbnRvIDQgY2h1bmtzIG9mIDE2IGJpdHMsIGFuZCB0aGVuIHN1bSB0aGUgY2h1bmtzLlxyXG5cclxuICAgICAgICB2YXIgYTQ4ID0gdGhpcy5oaWdoID4+PiAxNjtcclxuICAgICAgICB2YXIgYTMyID0gdGhpcy5oaWdoICYgMHhGRkZGO1xyXG4gICAgICAgIHZhciBhMTYgPSB0aGlzLmxvdyA+Pj4gMTY7XHJcbiAgICAgICAgdmFyIGEwMCA9IHRoaXMubG93ICYgMHhGRkZGO1xyXG5cclxuICAgICAgICB2YXIgYjQ4ID0gYWRkZW5kLmhpZ2ggPj4+IDE2O1xyXG4gICAgICAgIHZhciBiMzIgPSBhZGRlbmQuaGlnaCAmIDB4RkZGRjtcclxuICAgICAgICB2YXIgYjE2ID0gYWRkZW5kLmxvdyA+Pj4gMTY7XHJcbiAgICAgICAgdmFyIGIwMCA9IGFkZGVuZC5sb3cgJiAweEZGRkY7XHJcblxyXG4gICAgICAgIHZhciBjNDggPSAwLCBjMzIgPSAwLCBjMTYgPSAwLCBjMDAgPSAwO1xyXG4gICAgICAgIGMwMCArPSBhMDAgKyBiMDA7XHJcbiAgICAgICAgYzE2ICs9IGMwMCA+Pj4gMTY7XHJcbiAgICAgICAgYzAwICY9IDB4RkZGRjtcclxuICAgICAgICBjMTYgKz0gYTE2ICsgYjE2O1xyXG4gICAgICAgIGMzMiArPSBjMTYgPj4+IDE2O1xyXG4gICAgICAgIGMxNiAmPSAweEZGRkY7XHJcbiAgICAgICAgYzMyICs9IGEzMiArIGIzMjtcclxuICAgICAgICBjNDggKz0gYzMyID4+PiAxNjtcclxuICAgICAgICBjMzIgJj0gMHhGRkZGO1xyXG4gICAgICAgIGM0OCArPSBhNDggKyBiNDg7XHJcbiAgICAgICAgYzQ4ICY9IDB4RkZGRjtcclxuICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cygoYzE2IDw8IDE2KSB8IGMwMCwgKGM0OCA8PCAxNikgfCBjMzIsIHRoaXMudW5zaWduZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIGRpZmZlcmVuY2Ugb2YgdGhpcyBhbmQgdGhlIHNwZWNpZmllZCBMb25nLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBzdWJ0cmFoZW5kIFN1YnRyYWhlbmRcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gRGlmZmVyZW5jZVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5zdWJ0cmFjdCA9IGZ1bmN0aW9uKHN1YnRyYWhlbmQpIHtcclxuICAgICAgICBpZiAoIUxvbmcuaXNMb25nKHN1YnRyYWhlbmQpKVxyXG4gICAgICAgICAgICBzdWJ0cmFoZW5kID0gTG9uZy5mcm9tVmFsdWUoc3VidHJhaGVuZCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkKHN1YnRyYWhlbmQubmVnYXRlKCkpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIHByb2R1Y3Qgb2YgdGhpcyBhbmQgdGhlIHNwZWNpZmllZCBMb25nLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBtdWx0aXBsaWVyIE11bHRpcGxpZXJcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gUHJvZHVjdFxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5tdWx0aXBseSA9IGZ1bmN0aW9uKG11bHRpcGxpZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5pc1plcm8oKSlcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuWkVSTztcclxuICAgICAgICBpZiAoIUxvbmcuaXNMb25nKG11bHRpcGxpZXIpKVxyXG4gICAgICAgICAgICBtdWx0aXBsaWVyID0gTG9uZy5mcm9tVmFsdWUobXVsdGlwbGllcik7XHJcbiAgICAgICAgaWYgKG11bHRpcGxpZXIuaXNaZXJvKCkpXHJcbiAgICAgICAgICAgIHJldHVybiBMb25nLlpFUk87XHJcbiAgICAgICAgaWYgKHRoaXMuZXF1YWxzKExvbmcuTUlOX1ZBTFVFKSlcclxuICAgICAgICAgICAgcmV0dXJuIG11bHRpcGxpZXIuaXNPZGQoKSA/IExvbmcuTUlOX1ZBTFVFIDogTG9uZy5aRVJPO1xyXG4gICAgICAgIGlmIChtdWx0aXBsaWVyLmVxdWFscyhMb25nLk1JTl9WQUxVRSkpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzT2RkKCkgPyBMb25nLk1JTl9WQUxVRSA6IExvbmcuWkVSTztcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaXNOZWdhdGl2ZSgpKSB7XHJcbiAgICAgICAgICAgIGlmIChtdWx0aXBsaWVyLmlzTmVnYXRpdmUoKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZ2F0ZSgpLm11bHRpcGx5KG11bHRpcGxpZXIubmVnYXRlKCkpO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5uZWdhdGUoKS5tdWx0aXBseShtdWx0aXBsaWVyKS5uZWdhdGUoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKG11bHRpcGxpZXIuaXNOZWdhdGl2ZSgpKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tdWx0aXBseShtdWx0aXBsaWVyLm5lZ2F0ZSgpKS5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYm90aCBsb25ncyBhcmUgc21hbGwsIHVzZSBmbG9hdCBtdWx0aXBsaWNhdGlvblxyXG4gICAgICAgIGlmICh0aGlzLmxlc3NUaGFuKFRXT19QV1JfMjQpICYmIG11bHRpcGxpZXIubGVzc1RoYW4oVFdPX1BXUl8yNCkpXHJcbiAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21OdW1iZXIodGhpcy50b051bWJlcigpICogbXVsdGlwbGllci50b051bWJlcigpLCB0aGlzLnVuc2lnbmVkKTtcclxuXHJcbiAgICAgICAgLy8gRGl2aWRlIGVhY2ggbG9uZyBpbnRvIDQgY2h1bmtzIG9mIDE2IGJpdHMsIGFuZCB0aGVuIGFkZCB1cCA0eDQgcHJvZHVjdHMuXHJcbiAgICAgICAgLy8gV2UgY2FuIHNraXAgcHJvZHVjdHMgdGhhdCB3b3VsZCBvdmVyZmxvdy5cclxuXHJcbiAgICAgICAgdmFyIGE0OCA9IHRoaXMuaGlnaCA+Pj4gMTY7XHJcbiAgICAgICAgdmFyIGEzMiA9IHRoaXMuaGlnaCAmIDB4RkZGRjtcclxuICAgICAgICB2YXIgYTE2ID0gdGhpcy5sb3cgPj4+IDE2O1xyXG4gICAgICAgIHZhciBhMDAgPSB0aGlzLmxvdyAmIDB4RkZGRjtcclxuXHJcbiAgICAgICAgdmFyIGI0OCA9IG11bHRpcGxpZXIuaGlnaCA+Pj4gMTY7XHJcbiAgICAgICAgdmFyIGIzMiA9IG11bHRpcGxpZXIuaGlnaCAmIDB4RkZGRjtcclxuICAgICAgICB2YXIgYjE2ID0gbXVsdGlwbGllci5sb3cgPj4+IDE2O1xyXG4gICAgICAgIHZhciBiMDAgPSBtdWx0aXBsaWVyLmxvdyAmIDB4RkZGRjtcclxuXHJcbiAgICAgICAgdmFyIGM0OCA9IDAsIGMzMiA9IDAsIGMxNiA9IDAsIGMwMCA9IDA7XHJcbiAgICAgICAgYzAwICs9IGEwMCAqIGIwMDtcclxuICAgICAgICBjMTYgKz0gYzAwID4+PiAxNjtcclxuICAgICAgICBjMDAgJj0gMHhGRkZGO1xyXG4gICAgICAgIGMxNiArPSBhMTYgKiBiMDA7XHJcbiAgICAgICAgYzMyICs9IGMxNiA+Pj4gMTY7XHJcbiAgICAgICAgYzE2ICY9IDB4RkZGRjtcclxuICAgICAgICBjMTYgKz0gYTAwICogYjE2O1xyXG4gICAgICAgIGMzMiArPSBjMTYgPj4+IDE2O1xyXG4gICAgICAgIGMxNiAmPSAweEZGRkY7XHJcbiAgICAgICAgYzMyICs9IGEzMiAqIGIwMDtcclxuICAgICAgICBjNDggKz0gYzMyID4+PiAxNjtcclxuICAgICAgICBjMzIgJj0gMHhGRkZGO1xyXG4gICAgICAgIGMzMiArPSBhMTYgKiBiMTY7XHJcbiAgICAgICAgYzQ4ICs9IGMzMiA+Pj4gMTY7XHJcbiAgICAgICAgYzMyICY9IDB4RkZGRjtcclxuICAgICAgICBjMzIgKz0gYTAwICogYjMyO1xyXG4gICAgICAgIGM0OCArPSBjMzIgPj4+IDE2O1xyXG4gICAgICAgIGMzMiAmPSAweEZGRkY7XHJcbiAgICAgICAgYzQ4ICs9IGE0OCAqIGIwMCArIGEzMiAqIGIxNiArIGExNiAqIGIzMiArIGEwMCAqIGI0ODtcclxuICAgICAgICBjNDggJj0gMHhGRkZGO1xyXG4gICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKChjMTYgPDwgMTYpIHwgYzAwLCAoYzQ4IDw8IDE2KSB8IGMzMiwgdGhpcy51bnNpZ25lZCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGlzIExvbmcgZGl2aWRlZCBieSB0aGUgc3BlY2lmaWVkLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBkaXZpc29yIERpdmlzb3JcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gUXVvdGllbnRcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuZGl2ID0gZnVuY3Rpb24oZGl2aXNvcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcoZGl2aXNvcikpXHJcbiAgICAgICAgICAgIGRpdmlzb3IgPSBMb25nLmZyb21WYWx1ZShkaXZpc29yKTtcclxuICAgICAgICBpZiAoZGl2aXNvci5pc1plcm8oKSlcclxuICAgICAgICAgICAgdGhyb3cobmV3IEVycm9yKCdkaXZpc2lvbiBieSB6ZXJvJykpO1xyXG4gICAgICAgIGlmICh0aGlzLmlzWmVybygpKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51bnNpZ25lZCA/IExvbmcuVVpFUk8gOiBMb25nLlpFUk87XHJcbiAgICAgICAgdmFyIGFwcHJveCwgcmVtLCByZXM7XHJcbiAgICAgICAgaWYgKHRoaXMuZXF1YWxzKExvbmcuTUlOX1ZBTFVFKSkge1xyXG4gICAgICAgICAgICBpZiAoZGl2aXNvci5lcXVhbHMoTG9uZy5PTkUpIHx8IGRpdmlzb3IuZXF1YWxzKExvbmcuTkVHX09ORSkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTG9uZy5NSU5fVkFMVUU7ICAvLyByZWNhbGwgdGhhdCAtTUlOX1ZBTFVFID09IE1JTl9WQUxVRVxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXZpc29yLmVxdWFscyhMb25nLk1JTl9WQUxVRSkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTG9uZy5PTkU7XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCwgd2UgaGF2ZSB8b3RoZXJ8ID49IDIsIHNvIHx0aGlzL290aGVyfCA8IHxNSU5fVkFMVUV8LlxyXG4gICAgICAgICAgICAgICAgdmFyIGhhbGZUaGlzID0gdGhpcy5zaGlmdFJpZ2h0KDEpO1xyXG4gICAgICAgICAgICAgICAgYXBwcm94ID0gaGFsZlRoaXMuZGl2KGRpdmlzb3IpLnNoaWZ0TGVmdCgxKTtcclxuICAgICAgICAgICAgICAgIGlmIChhcHByb3guZXF1YWxzKExvbmcuWkVSTykpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZGl2aXNvci5pc05lZ2F0aXZlKCkgPyBMb25nLk9ORSA6IExvbmcuTkVHX09ORTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVtID0gdGhpcy5zdWJ0cmFjdChkaXZpc29yLm11bHRpcGx5KGFwcHJveCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlcyA9IGFwcHJveC5hZGQocmVtLmRpdihkaXZpc29yKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAoZGl2aXNvci5lcXVhbHMoTG9uZy5NSU5fVkFMVUUpKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51bnNpZ25lZCA/IExvbmcuVVpFUk8gOiBMb25nLlpFUk87XHJcbiAgICAgICAgaWYgKHRoaXMuaXNOZWdhdGl2ZSgpKSB7XHJcbiAgICAgICAgICAgIGlmIChkaXZpc29yLmlzTmVnYXRpdmUoKSlcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZ2F0ZSgpLmRpdihkaXZpc29yLm5lZ2F0ZSgpKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubmVnYXRlKCkuZGl2KGRpdmlzb3IpLm5lZ2F0ZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZGl2aXNvci5pc05lZ2F0aXZlKCkpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRpdihkaXZpc29yLm5lZ2F0ZSgpKS5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gUmVwZWF0IHRoZSBmb2xsb3dpbmcgdW50aWwgdGhlIHJlbWFpbmRlciBpcyBsZXNzIHRoYW4gb3RoZXI6ICBmaW5kIGFcclxuICAgICAgICAvLyBmbG9hdGluZy1wb2ludCB0aGF0IGFwcHJveGltYXRlcyByZW1haW5kZXIgLyBvdGhlciAqZnJvbSBiZWxvdyosIGFkZCB0aGlzXHJcbiAgICAgICAgLy8gaW50byB0aGUgcmVzdWx0LCBhbmQgc3VidHJhY3QgaXQgZnJvbSB0aGUgcmVtYWluZGVyLiAgSXQgaXMgY3JpdGljYWwgdGhhdFxyXG4gICAgICAgIC8vIHRoZSBhcHByb3hpbWF0ZSB2YWx1ZSBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHJlYWwgdmFsdWUgc28gdGhhdCB0aGVcclxuICAgICAgICAvLyByZW1haW5kZXIgbmV2ZXIgYmVjb21lcyBuZWdhdGl2ZS5cclxuICAgICAgICByZXMgPSBMb25nLlpFUk87XHJcbiAgICAgICAgcmVtID0gdGhpcztcclxuICAgICAgICB3aGlsZSAocmVtLmdyZWF0ZXJUaGFuT3JFcXVhbChkaXZpc29yKSkge1xyXG4gICAgICAgICAgICAvLyBBcHByb3hpbWF0ZSB0aGUgcmVzdWx0IG9mIGRpdmlzaW9uLiBUaGlzIG1heSBiZSBhIGxpdHRsZSBncmVhdGVyIG9yXHJcbiAgICAgICAgICAgIC8vIHNtYWxsZXIgdGhhbiB0aGUgYWN0dWFsIHZhbHVlLlxyXG4gICAgICAgICAgICBhcHByb3ggPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKHJlbS50b051bWJlcigpIC8gZGl2aXNvci50b051bWJlcigpKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBXZSB3aWxsIHR3ZWFrIHRoZSBhcHByb3hpbWF0ZSByZXN1bHQgYnkgY2hhbmdpbmcgaXQgaW4gdGhlIDQ4LXRoIGRpZ2l0IG9yXHJcbiAgICAgICAgICAgIC8vIHRoZSBzbWFsbGVzdCBub24tZnJhY3Rpb25hbCBkaWdpdCwgd2hpY2hldmVyIGlzIGxhcmdlci5cclxuICAgICAgICAgICAgdmFyIGxvZzIgPSBNYXRoLmNlaWwoTWF0aC5sb2coYXBwcm94KSAvIE1hdGguTE4yKSxcclxuICAgICAgICAgICAgICAgIGRlbHRhID0gKGxvZzIgPD0gNDgpID8gMSA6IE1hdGgucG93KDIsIGxvZzIgLSA0OCksXHJcblxyXG4gICAgICAgICAgICAvLyBEZWNyZWFzZSB0aGUgYXBwcm94aW1hdGlvbiB1bnRpbCBpdCBpcyBzbWFsbGVyIHRoYW4gdGhlIHJlbWFpbmRlci4gIE5vdGVcclxuICAgICAgICAgICAgLy8gdGhhdCBpZiBpdCBpcyB0b28gbGFyZ2UsIHRoZSBwcm9kdWN0IG92ZXJmbG93cyBhbmQgaXMgbmVnYXRpdmUuXHJcbiAgICAgICAgICAgICAgICBhcHByb3hSZXMgPSBMb25nLmZyb21OdW1iZXIoYXBwcm94KSxcclxuICAgICAgICAgICAgICAgIGFwcHJveFJlbSA9IGFwcHJveFJlcy5tdWx0aXBseShkaXZpc29yKTtcclxuICAgICAgICAgICAgd2hpbGUgKGFwcHJveFJlbS5pc05lZ2F0aXZlKCkgfHwgYXBwcm94UmVtLmdyZWF0ZXJUaGFuKHJlbSkpIHtcclxuICAgICAgICAgICAgICAgIGFwcHJveCAtPSBkZWx0YTtcclxuICAgICAgICAgICAgICAgIGFwcHJveFJlcyA9IExvbmcuZnJvbU51bWJlcihhcHByb3gsIHRoaXMudW5zaWduZWQpO1xyXG4gICAgICAgICAgICAgICAgYXBwcm94UmVtID0gYXBwcm94UmVzLm11bHRpcGx5KGRpdmlzb3IpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBXZSBrbm93IHRoZSBhbnN3ZXIgY2FuJ3QgYmUgemVyby4uLiBhbmQgYWN0dWFsbHksIHplcm8gd291bGQgY2F1c2VcclxuICAgICAgICAgICAgLy8gaW5maW5pdGUgcmVjdXJzaW9uIHNpbmNlIHdlIHdvdWxkIG1ha2Ugbm8gcHJvZ3Jlc3MuXHJcbiAgICAgICAgICAgIGlmIChhcHByb3hSZXMuaXNaZXJvKCkpXHJcbiAgICAgICAgICAgICAgICBhcHByb3hSZXMgPSBMb25nLk9ORTtcclxuXHJcbiAgICAgICAgICAgIHJlcyA9IHJlcy5hZGQoYXBwcm94UmVzKTtcclxuICAgICAgICAgICAgcmVtID0gcmVtLnN1YnRyYWN0KGFwcHJveFJlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXM7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGlzIExvbmcgbW9kdWxvIHRoZSBzcGVjaWZpZWQuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IGRpdmlzb3IgRGl2aXNvclxyXG4gICAgICogQHJldHVybnMgeyFMb25nfSBSZW1haW5kZXJcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUubW9kdWxvID0gZnVuY3Rpb24oZGl2aXNvcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcoZGl2aXNvcikpXHJcbiAgICAgICAgICAgIGRpdmlzb3IgPSBMb25nLmZyb21WYWx1ZShkaXZpc29yKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5zdWJ0cmFjdCh0aGlzLmRpdihkaXZpc29yKS5tdWx0aXBseShkaXZpc29yKSk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgYml0d2lzZSBOT1Qgb2YgdGhpcyBMb25nLlxyXG4gICAgICogQHJldHVybnMgeyFMb25nfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5ub3QgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyh+dGhpcy5sb3csIH50aGlzLmhpZ2gsIHRoaXMudW5zaWduZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIGJpdHdpc2UgQU5EIG9mIHRoaXMgTG9uZyBhbmQgdGhlIHNwZWNpZmllZC5cclxuICAgICAqIEBwYXJhbSB7IUxvbmd8bnVtYmVyfHN0cmluZ30gb3RoZXIgT3RoZXIgTG9uZ1xyXG4gICAgICogQHJldHVybnMgeyFMb25nfVxyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS5hbmQgPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcob3RoZXIpKVxyXG4gICAgICAgICAgICBvdGhlciA9IExvbmcuZnJvbVZhbHVlKG90aGVyKTtcclxuICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyh0aGlzLmxvdyAmIG90aGVyLmxvdywgdGhpcy5oaWdoICYgb3RoZXIuaGlnaCwgdGhpcy51bnNpZ25lZCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgYml0d2lzZSBPUiBvZiB0aGlzIExvbmcgYW5kIHRoZSBzcGVjaWZpZWQuXHJcbiAgICAgKiBAcGFyYW0geyFMb25nfG51bWJlcnxzdHJpbmd9IG90aGVyIE90aGVyIExvbmdcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ31cclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUub3IgPSBmdW5jdGlvbihvdGhlcikge1xyXG4gICAgICAgIGlmICghTG9uZy5pc0xvbmcob3RoZXIpKVxyXG4gICAgICAgICAgICBvdGhlciA9IExvbmcuZnJvbVZhbHVlKG90aGVyKTtcclxuICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyh0aGlzLmxvdyB8IG90aGVyLmxvdywgdGhpcy5oaWdoIHwgb3RoZXIuaGlnaCwgdGhpcy51bnNpZ25lZCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmV0dXJucyB0aGUgYml0d2lzZSBYT1Igb2YgdGhpcyBMb25nIGFuZCB0aGUgZ2l2ZW4gb25lLlxyXG4gICAgICogQHBhcmFtIHshTG9uZ3xudW1iZXJ8c3RyaW5nfSBvdGhlciBPdGhlciBMb25nXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9XHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLnhvciA9IGZ1bmN0aW9uKG90aGVyKSB7XHJcbiAgICAgICAgaWYgKCFMb25nLmlzTG9uZyhvdGhlcikpXHJcbiAgICAgICAgICAgIG90aGVyID0gTG9uZy5mcm9tVmFsdWUob3RoZXIpO1xyXG4gICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKHRoaXMubG93IF4gb3RoZXIubG93LCB0aGlzLmhpZ2ggXiBvdGhlci5oaWdoLCB0aGlzLnVuc2lnbmVkKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoaXMgTG9uZyB3aXRoIGJpdHMgc2hpZnRlZCB0byB0aGUgbGVmdCBieSB0aGUgZ2l2ZW4gYW1vdW50LlxyXG4gICAgICogQHBhcmFtIHtudW1iZXJ8IUxvbmd9IG51bUJpdHMgTnVtYmVyIG9mIGJpdHNcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gU2hpZnRlZCBMb25nXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLnNoaWZ0TGVmdCA9IGZ1bmN0aW9uKG51bUJpdHMpIHtcclxuICAgICAgICBpZiAoTG9uZy5pc0xvbmcobnVtQml0cykpXHJcbiAgICAgICAgICAgIG51bUJpdHMgPSBudW1CaXRzLnRvSW50KCk7XHJcbiAgICAgICAgaWYgKChudW1CaXRzICY9IDYzKSA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgZWxzZSBpZiAobnVtQml0cyA8IDMyKVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyh0aGlzLmxvdyA8PCBudW1CaXRzLCAodGhpcy5oaWdoIDw8IG51bUJpdHMpIHwgKHRoaXMubG93ID4+PiAoMzIgLSBudW1CaXRzKSksIHRoaXMudW5zaWduZWQpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMoMCwgdGhpcy5sb3cgPDwgKG51bUJpdHMgLSAzMiksIHRoaXMudW5zaWduZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhpcyBMb25nIHdpdGggYml0cyBhcml0aG1ldGljYWxseSBzaGlmdGVkIHRvIHRoZSByaWdodCBieSB0aGUgZ2l2ZW4gYW1vdW50LlxyXG4gICAgICogQHBhcmFtIHtudW1iZXJ8IUxvbmd9IG51bUJpdHMgTnVtYmVyIG9mIGJpdHNcclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gU2hpZnRlZCBMb25nXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLnNoaWZ0UmlnaHQgPSBmdW5jdGlvbihudW1CaXRzKSB7XHJcbiAgICAgICAgaWYgKExvbmcuaXNMb25nKG51bUJpdHMpKVxyXG4gICAgICAgICAgICBudW1CaXRzID0gbnVtQml0cy50b0ludCgpO1xyXG4gICAgICAgIGlmICgobnVtQml0cyAmPSA2MykgPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIGVsc2UgaWYgKG51bUJpdHMgPCAzMilcclxuICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMoKHRoaXMubG93ID4+PiBudW1CaXRzKSB8ICh0aGlzLmhpZ2ggPDwgKDMyIC0gbnVtQml0cykpLCB0aGlzLmhpZ2ggPj4gbnVtQml0cywgdGhpcy51bnNpZ25lZCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyh0aGlzLmhpZ2ggPj4gKG51bUJpdHMgLSAzMiksIHRoaXMuaGlnaCA+PSAwID8gMCA6IC0xLCB0aGlzLnVuc2lnbmVkKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm5zIHRoaXMgTG9uZyB3aXRoIGJpdHMgbG9naWNhbGx5IHNoaWZ0ZWQgdG8gdGhlIHJpZ2h0IGJ5IHRoZSBnaXZlbiBhbW91bnQuXHJcbiAgICAgKiBAcGFyYW0ge251bWJlcnwhTG9uZ30gbnVtQml0cyBOdW1iZXIgb2YgYml0c1xyXG4gICAgICogQHJldHVybnMgeyFMb25nfSBTaGlmdGVkIExvbmdcclxuICAgICAqIEBleHBvc2VcclxuICAgICAqL1xyXG4gICAgTG9uZy5wcm90b3R5cGUuc2hpZnRSaWdodFVuc2lnbmVkID0gZnVuY3Rpb24obnVtQml0cykge1xyXG4gICAgICAgIGlmIChMb25nLmlzTG9uZyhudW1CaXRzKSlcclxuICAgICAgICAgICAgbnVtQml0cyA9IG51bUJpdHMudG9JbnQoKTtcclxuICAgICAgICBudW1CaXRzICY9IDYzO1xyXG4gICAgICAgIGlmIChudW1CaXRzID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdmFyIGhpZ2ggPSB0aGlzLmhpZ2g7XHJcbiAgICAgICAgICAgIGlmIChudW1CaXRzIDwgMzIpIHtcclxuICAgICAgICAgICAgICAgIHZhciBsb3cgPSB0aGlzLmxvdztcclxuICAgICAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKChsb3cgPj4+IG51bUJpdHMpIHwgKGhpZ2ggPDwgKDMyIC0gbnVtQml0cykpLCBoaWdoID4+PiBudW1CaXRzLCB0aGlzLnVuc2lnbmVkKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChudW1CaXRzID09PSAzMilcclxuICAgICAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKGhpZ2gsIDAsIHRoaXMudW5zaWduZWQpO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyhoaWdoID4+PiAobnVtQml0cyAtIDMyKSwgMCwgdGhpcy51bnNpZ25lZCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoaXMgTG9uZyB0byBzaWduZWQuXHJcbiAgICAgKiBAcmV0dXJucyB7IUxvbmd9IFNpZ25lZCBsb25nXHJcbiAgICAgKiBAZXhwb3NlXHJcbiAgICAgKi9cclxuICAgIExvbmcucHJvdG90eXBlLnRvU2lnbmVkID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnVuc2lnbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICByZXR1cm4gbmV3IExvbmcodGhpcy5sb3csIHRoaXMuaGlnaCwgZmFsc2UpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoaXMgTG9uZyB0byB1bnNpZ25lZC5cclxuICAgICAqIEByZXR1cm5zIHshTG9uZ30gVW5zaWduZWQgbG9uZ1xyXG4gICAgICogQGV4cG9zZVxyXG4gICAgICovXHJcbiAgICBMb25nLnByb3RvdHlwZS50b1Vuc2lnbmVkID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYgKHRoaXMudW5zaWduZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIHJldHVybiBuZXcgTG9uZyh0aGlzLmxvdywgdGhpcy5oaWdoLCB0cnVlKTtcclxuICAgIH07XHJcblxyXG4gICAgLyogQ29tbW9uSlMgKi8gaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZVtcImV4cG9ydHNcIl0pXHJcbiAgICAgICAgbW9kdWxlW1wiZXhwb3J0c1wiXSA9IExvbmc7XHJcbiAgICAvKiBBTUQgKi8gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmVbXCJhbWRcIl0pXHJcbiAgICAgICAgZGVmaW5lKGZ1bmN0aW9uKCkgeyByZXR1cm4gTG9uZzsgfSk7XHJcbiAgICAvKiBHbG9iYWwgKi8gZWxzZVxyXG4gICAgICAgIChnbG9iYWxbXCJkY29kZUlPXCJdID0gZ2xvYmFsW1wiZGNvZGVJT1wiXSB8fCB7fSlbXCJMb25nXCJdID0gTG9uZztcclxuXHJcbn0pKHRoaXMpO1xyXG4iLCIvKlxyXG4gQ29weXJpZ2h0IDIwMTMgRGFuaWVsIFdpcnR6IDxkY29kZUBkY29kZS5pbz5cclxuIENvcHlyaWdodCAyMDA5IFRoZSBDbG9zdXJlIExpYnJhcnkgQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cclxuXHJcbiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xyXG4geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxyXG4gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XHJcblxyXG4gaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXHJcblxyXG4gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxyXG4gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUy1JU1wiIEJBU0lTLFxyXG4gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXHJcbiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXHJcbiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cclxuICovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2Rpc3QvTG9uZy5qc1wiKTtcclxuIiwiIWZ1bmN0aW9uKGdsb2JhbHMpe1xuJ3VzZSBzdHJpY3QnXG5cbi8vKioqIFVNRCBCRUdJTlxuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQpIHsgLy9yZXF1aXJlLmpzIC8gQU1EXG4gIGRlZmluZShbXSwgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHNlY3VyZVJhbmRvbVxuICB9KVxufSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykgeyAvL0NvbW1vbkpTXG4gIG1vZHVsZS5leHBvcnRzID0gc2VjdXJlUmFuZG9tXG59IGVsc2UgeyAvL3NjcmlwdCAvIGJyb3dzZXJcbiAgZ2xvYmFscy5zZWN1cmVSYW5kb20gPSBzZWN1cmVSYW5kb21cbn1cbi8vKioqIFVNRCBFTkRcblxuLy9vcHRpb25zLnR5cGUgaXMgdGhlIG9ubHkgdmFsaWQgb3B0aW9uXG5mdW5jdGlvbiBzZWN1cmVSYW5kb20oY291bnQsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge3R5cGU6ICdBcnJheSd9XG4gIC8vd2UgY2hlY2sgZm9yIHByb2Nlc3MucGlkIHRvIHByZXZlbnQgYnJvd3NlcmlmeSBmcm9tIHRyaWNraW5nIHVzXG4gIGlmICh0eXBlb2YgcHJvY2VzcyAhPSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2Vzcy5waWQgPT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gbm9kZVJhbmRvbShjb3VudCwgb3B0aW9ucylcbiAgfSBlbHNlIHtcbiAgICB2YXIgY3J5cHRvID0gd2luZG93LmNyeXB0byB8fCB3aW5kb3cubXNDcnlwdG9cbiAgICBpZiAoIWNyeXB0bykgdGhyb3cgbmV3IEVycm9yKFwiWW91ciBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgd2luZG93LmNyeXB0by5cIilcbiAgICByZXR1cm4gYnJvd3NlclJhbmRvbShjb3VudCwgb3B0aW9ucylcbiAgfVxufVxuXG5mdW5jdGlvbiBub2RlUmFuZG9tKGNvdW50LCBvcHRpb25zKSB7XG4gIHZhciBjcnlwdG8gPSByZXF1aXJlKCdjcnlwdG8nKVxuICB2YXIgYnVmID0gY3J5cHRvLnJhbmRvbUJ5dGVzKGNvdW50KVxuXG4gIHN3aXRjaCAob3B0aW9ucy50eXBlKSB7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIFtdLnNsaWNlLmNhbGwoYnVmKVxuICAgIGNhc2UgJ0J1ZmZlcic6XG4gICAgICByZXR1cm4gYnVmXG4gICAgY2FzZSAnVWludDhBcnJheSc6XG4gICAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoY291bnQpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHsgYXJyW2ldID0gYnVmLnJlYWRVSW50OChpKSB9XG4gICAgICByZXR1cm4gYXJyXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcihvcHRpb25zLnR5cGUgKyBcIiBpcyB1bnN1cHBvcnRlZC5cIilcbiAgfVxufVxuXG5mdW5jdGlvbiBicm93c2VyUmFuZG9tKGNvdW50LCBvcHRpb25zKSB7XG4gIHZhciBuYXRpdmVBcnIgPSBuZXcgVWludDhBcnJheShjb3VudClcbiAgdmFyIGNyeXB0byA9IHdpbmRvdy5jcnlwdG8gfHwgd2luZG93Lm1zQ3J5cHRvXG4gIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmF0aXZlQXJyKVxuXG4gIHN3aXRjaCAob3B0aW9ucy50eXBlKSB7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIFtdLnNsaWNlLmNhbGwobmF0aXZlQXJyKVxuICAgIGNhc2UgJ0J1ZmZlcic6XG4gICAgICB0cnkgeyB2YXIgYiA9IG5ldyBCdWZmZXIoMSkgfSBjYXRjaChlKSB7IHRocm93IG5ldyBFcnJvcignQnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBlbnZpcm9ubWVudC4gVXNlIE5vZGUuanMgb3IgQnJvd3NlcmlmeSBmb3IgYnJvd3NlciBzdXBwb3J0LicpfVxuICAgICAgcmV0dXJuIG5ldyBCdWZmZXIobmF0aXZlQXJyKVxuICAgIGNhc2UgJ1VpbnQ4QXJyYXknOlxuICAgICAgcmV0dXJuIG5hdGl2ZUFyclxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3Iob3B0aW9ucy50eXBlICsgXCIgaXMgdW5zdXBwb3J0ZWQuXCIpXG4gIH1cbn1cblxuc2VjdXJlUmFuZG9tLnJhbmRvbUFycmF5ID0gZnVuY3Rpb24oYnl0ZUNvdW50KSB7XG4gIHJldHVybiBzZWN1cmVSYW5kb20oYnl0ZUNvdW50LCB7dHlwZTogJ0FycmF5J30pXG59XG5cbnNlY3VyZVJhbmRvbS5yYW5kb21VaW50OEFycmF5ID0gZnVuY3Rpb24oYnl0ZUNvdW50KSB7XG4gIHJldHVybiBzZWN1cmVSYW5kb20oYnl0ZUNvdW50LCB7dHlwZTogJ1VpbnQ4QXJyYXknfSlcbn1cblxuc2VjdXJlUmFuZG9tLnJhbmRvbUJ1ZmZlciA9IGZ1bmN0aW9uKGJ5dGVDb3VudCkge1xuICByZXR1cm4gc2VjdXJlUmFuZG9tKGJ5dGVDb3VudCwge3R5cGU6ICdCdWZmZXInfSlcbn1cblxuXG59KHRoaXMpO1xuIl19
