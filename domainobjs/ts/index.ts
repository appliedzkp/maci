import * as assert from 'assert'
import {
    bigInt,
    Ciphertext,
    Plaintext,
    EcdhSharedKey,
    Signature,
    SnarkBigInt,
    PubKey as RawPubKey,
    PrivKey as RawPrivKey,
    encrypt,
    decrypt,
    sign,
    hash5,
    hash11,
    verifySignature,
    genRandomSalt,
    genKeypair,
    genPubKey,
    formatPrivKeyForBabyJub,
    genEcdhSharedKey,
    packPubKey,
    unpackPubKey,
    SNARK_FIELD_SIZE
} from 'maci-crypto'

interface Keypair {
    privKey: RawPrivKey;
    pubKey: RawPubKey;
}


const SERIALIZED_PRIV_KEY_PREFIX = 'macisk.'

class PrivKey {
    public rawPrivKey: RawPrivKey

    constructor (rawPrivKey: RawPrivKey) {
        this.rawPrivKey = rawPrivKey
    }

    public copy = (): PrivKey => {
        return new PrivKey(bigInt(this.rawPrivKey.toString()))
    }

    public asCircuitInputs = () => {
        return formatPrivKeyForBabyJub(this.rawPrivKey).toString()
    }

    public serialize = (): string => {
        return SERIALIZED_PRIV_KEY_PREFIX + this.rawPrivKey.toString(16)
    }

    public static unserialize = (s: string): PrivKey => {
        const x = s.slice(SERIALIZED_PRIV_KEY_PREFIX.length)
        return new PrivKey(bigInt('0x' + x))
    }

    public static isValidSerializedPrivKey = (s: string): boolean => {
        const correctPrefix = s.startsWith(SERIALIZED_PRIV_KEY_PREFIX)
        const x = s.slice(SERIALIZED_PRIV_KEY_PREFIX.length)

        let validValue = false
        try {
            const value = bigInt('0x' + x)
            validValue = value < SNARK_FIELD_SIZE
        } catch {
            // comment to make linter happy 
        }

        return correctPrefix && validValue
    }
}

const SERIALIZED_PUB_KEY_PREFIX = 'macipk.'

class PubKey {
    public rawPubKey: RawPubKey

    constructor (rawPubKey: RawPubKey) {
        assert(rawPubKey.length === 2)
        assert(rawPubKey[0] < SNARK_FIELD_SIZE)
        assert(rawPubKey[1] < SNARK_FIELD_SIZE)
        this.rawPubKey = rawPubKey
    }

    public copy = (): PubKey => {

        return new PubKey([
            bigInt(this.rawPubKey[0].toString()),
            bigInt(this.rawPubKey[1].toString()),
        ])
    }

    public asContractParam = () => {
        return { 
            x: this.rawPubKey[0].toString(),
            y: this.rawPubKey[1].toString(),
        }
    }

    public asCircuitInputs = () => {
        return this.rawPubKey.map((x) => x.toString())
    }

    public asArray = (): SnarkBigInt[] => {
        return [
            this.rawPubKey[0],
            this.rawPubKey[1],
        ]
    }

    public serialize = (): string => {
        // Blank leaves have pubkey [0, 0], which packPubKey does not support
        if (
            bigInt(this.rawPubKey[0]).equals(bigInt(0)) && 
            bigInt(this.rawPubKey[1]).equals(bigInt(0))
        ) {
            return SERIALIZED_PUB_KEY_PREFIX + 'z'
        }
        const packed = packPubKey(this.rawPubKey).toString('hex')
        return SERIALIZED_PUB_KEY_PREFIX + packed.toString(16)
    }

    public static unserialize = (s: string): PubKey => {
        // Blank leaves have pubkey [0, 0], which packPubKey does not support
        if (s === SERIALIZED_PUB_KEY_PREFIX + 'z') {
            return new PubKey([0, 0])
        }

        const len = SERIALIZED_PUB_KEY_PREFIX.length
        const packed = Buffer.from(s.slice(len), 'hex')
        return new PubKey(unpackPubKey(packed))
    }

    public static isValidSerializedPubKey = (s: string): boolean => {
        const correctPrefix = s.startsWith(SERIALIZED_PUB_KEY_PREFIX)

        let validValue = false
        try {
            PubKey.unserialize(s)
            validValue = true
        } catch {
            // comment to make linter happy
        }

        return correctPrefix && validValue
    }
}

class Keypair implements Keypair {
    public privKey: PrivKey
    public pubKey: PubKey

    constructor (
        privKey?: PrivKey,
    ) {
        if (privKey) {
            this.privKey = privKey
            this.pubKey = new PubKey(genPubKey(privKey.rawPrivKey))
        } else {
            const rawKeyPair = genKeypair()
            this.privKey = new PrivKey(rawKeyPair.privKey)
            this.pubKey = new PubKey(rawKeyPair.pubKey)
        }
    }

    public copy = (): Keypair => {
        return new Keypair(this.privKey.copy())
    }
    
    public static genEcdhSharedKey(
        privKey: PrivKey,
        pubKey: PubKey,
    ) {
        return genEcdhSharedKey(privKey.rawPrivKey, pubKey.rawPubKey)
    }

    public equals(
        keypair: Keypair,
    ): boolean {

        const equalPrivKey = this.privKey.rawPrivKey === keypair.privKey.rawPrivKey
        const equalPubKey =
            this.pubKey.rawPubKey[0] === keypair.pubKey.rawPubKey[0] &&
            this.pubKey.rawPubKey[1] === keypair.pubKey.rawPubKey[1]

        // If this assertion fails, something is very wrong and this function
        // should not return anything 
        // XOR is equivalent to: (x && !y) || (!x && y ) 
        const x = (equalPrivKey && equalPubKey) 
        const y = (!equalPrivKey && !equalPubKey) 

        assert((x && !y) || (!x && y))

        return equalPrivKey
    }
}


interface IStateLeaf {
    pubKey: PubKey;
    voteOptionTreeRoot: SnarkBigInt;
    voiceCreditBalance: SnarkBigInt;
    nonce: SnarkBigInt;
}

interface VoteOptionTreeLeaf {
    votes: SnarkBigInt;
}

/*
 * An encrypted command and signature.
 */
class Message {
    public iv: SnarkBigInt
    public data: SnarkBigInt[]

    constructor (
        iv: SnarkBigInt,
        data: SnarkBigInt[],
    ) {
        assert(data.length === 10)
        this.iv = iv
        this.data = data
    }

    private asArray = (): SnarkBigInt[] => {

        return [
            this.iv,
            ...this.data,
        ]
    }

    public asContractParam = () => {
        return {
            iv: this.iv.toString(),
            data: this.data.map((x: SnarkBigInt) => x.toString()),
        }
    }

    public asCircuitInputs = (): SnarkBigInt[] => {

        return this.asArray()
    }

    public hash = (): SnarkBigInt => {

        return hash11(this.asArray())
    }

    public copy = (): Message => {

        return new Message(
            bigInt(this.iv.toString()),
            this.data.map((x: SnarkBigInt) => bigInt(x.toString())),
        )
    }
}

/*
 * A leaf in the state tree, which maps public keys to votes
 */
class StateLeaf implements IStateLeaf {
    public pubKey: PubKey
    public voteOptionTreeRoot: SnarkBigInt
    public voiceCreditBalance: SnarkBigInt
    public nonce: SnarkBigInt

    constructor (
        pubKey: PubKey,
        voteOptionTreeRoot: SnarkBigInt,
        voiceCreditBalance: SnarkBigInt,
        nonce: SnarkBigInt,
    ) {
        this.pubKey = pubKey
        this.voteOptionTreeRoot = voteOptionTreeRoot
        this.voiceCreditBalance = voiceCreditBalance
        // The this is the current nonce. i.e. a user who has published 0 valid
        // command should have this value at 0, and the first command should
        // have a nonce of 1
        this.nonce = nonce
    }

    public copy(): StateLeaf {
        return new StateLeaf(
            this.pubKey.copy(),
            bigInt(this.voteOptionTreeRoot.toString()),
            bigInt(this.voiceCreditBalance.toString()),
            bigInt(this.nonce.toString()),
        )
    }

    public static genBlankLeaf(
        emptyVoteOptionTreeRoot: SnarkBigInt,
    ): StateLeaf {
        return new StateLeaf(
            new PubKey([0, 0]),
            emptyVoteOptionTreeRoot,
            bigInt(0),
            bigInt(0),
        )
    }

    public static genRandomLeaf() {
        const keypair = new Keypair()
        return new StateLeaf(
            keypair.pubKey,
            genRandomSalt(),
            genRandomSalt(),
            genRandomSalt(),
        )
    }

    private asArray = (): SnarkBigInt[] => {

        return [
            ...this.pubKey.asArray(),
            this.voteOptionTreeRoot,
            this.voiceCreditBalance,
            this.nonce,
        ]
    }

    public asCircuitInputs = (): SnarkBigInt[] => {

        return this.asArray()
    }

    public hash = (): SnarkBigInt => {

        return hash5(this.asArray())
    }

    public serialize = (): string => {
        const j = {
            pubKey: this.pubKey.serialize(),
            voteOptionTreeRoot: this.voteOptionTreeRoot.toString(16),
            voiceCreditBalance: this.voiceCreditBalance.toString(16),
            nonce: this.nonce.toString(16),
        }

        return Buffer.from(JSON.stringify(j, null, 0), 'utf8').toString('base64')
    }

    static unserialize = (serialized: string): StateLeaf => {
        const j = JSON.parse(Buffer.from(serialized, 'base64').toString('utf8'))
        return new StateLeaf(
            PubKey.unserialize(j.pubKey),
            bigInt('0x' + j.voteOptionTreeRoot),
            bigInt('0x' + j.voiceCreditBalance),
            bigInt('0x' + j.nonce),
        )
    }
}

interface ICommand {
    stateIndex: SnarkBigInt;
    newPubKey: PubKey;
    voteOptionIndex: SnarkBigInt;
    newVoteWeight: SnarkBigInt;
    nonce: SnarkBigInt;

    sign: (PrivKey) => Signature;
    encrypt: (EcdhSharedKey, Signature) => Message;
}

/*
 * Unencrypted data whose fields include the user's public key, vote etc.
 */
class Command implements ICommand {
    public stateIndex: SnarkBigInt
    public newPubKey: PubKey
    public voteOptionIndex: SnarkBigInt
    public newVoteWeight: SnarkBigInt
    public nonce: SnarkBigInt
    public salt: SnarkBigInt

    constructor (
        stateIndex: SnarkBigInt,
        newPubKey: PubKey,
        voteOptionIndex: SnarkBigInt,
        newVoteWeight: SnarkBigInt,
        nonce: SnarkBigInt,
        salt: SnarkBigInt = genRandomSalt(),
    ) {
        this.stateIndex = stateIndex
        this.newPubKey = newPubKey
        this.voteOptionIndex = voteOptionIndex
        this.newVoteWeight = newVoteWeight
        this.nonce = nonce
        this.salt = salt
    }

    public copy = (): Command => {

        return new Command(
            bigInt(this.stateIndex.toString()),
            this.newPubKey.copy(),
            bigInt(this.voteOptionIndex.toString()),
            bigInt(this.newVoteWeight.toString()),
            bigInt(this.nonce.toString()),
            bigInt(this.salt.toString()),
        )
    }

    public asArray = (): SnarkBigInt[] => {

        return [
            this.stateIndex,
            ...this.newPubKey.asArray(),
            this.voteOptionIndex,
            this.newVoteWeight,
            this.nonce,
            this.salt,
        ]
    }

    /*
     * Check whether this command has deep equivalence to another command
     */
    public equals = (command: Command): boolean => {

        return this.stateIndex == command.stateIndex &&
            this.newPubKey[0] == command.newPubKey[0] &&
            this.newPubKey[1] == command.newPubKey[1] &&
            this.voteOptionIndex == command.voteOptionIndex &&
            this.newVoteWeight == command.newVoteWeight &&
            this.nonce == command.nonce &&
            this.salt == command.salt
    }

    public hash = (): SnarkBigInt => {
        return hash11(this.asArray())
    }

    /*
     * Signs this command and returns a Signature.
     */
    public sign = (
        privKey: PrivKey,
    ): Signature => {

        return sign(privKey.rawPrivKey, this.hash())
    }

    /*
     * Returns true if the given signature is a correct signature of this
     * command and signed by the private key associated with the given public
     * key.
     */
    public verifySignature = (
        signature: Signature,
        pubKey: PubKey,
    ): boolean => {

        return verifySignature(
            this.hash(),
            signature,
            pubKey.rawPubKey,
        )
    }

    /*
     * Encrypts this command along with a signature to produce a Message.
     */
    public encrypt = (
        signature: Signature,
        sharedKey: EcdhSharedKey,
    ): Message => {

        const plaintext: Plaintext = [
            ...this.asArray(),
            signature.R8[0],
            signature.R8[1],
            signature.S,
        ]

        const ciphertext: Ciphertext = encrypt(plaintext, sharedKey)
        const message = new Message(ciphertext.iv, ciphertext.data)
        
        return message
    }

    /*
     * Decrypts a Message to produce a Command.
     */
    public static decrypt = (
        message: Message,
        sharedKey: EcdhSharedKey,
    ) => {

        const decrypted = decrypt(message, sharedKey)

        const command = new Command(
            decrypted[0],
            new PubKey([decrypted[1], decrypted[2]]),
            decrypted[3],
            decrypted[4],
            decrypted[5],
            decrypted[6],
        )

        const signature = {
            R8: [decrypted[7], decrypted[8]],
            S: decrypted[9],
        }

        return { command, signature }
    }
}

export {
    StateLeaf,
    VoteOptionTreeLeaf,
    Command,
    Message,
    Keypair,
    PubKey,
    PrivKey,
}
