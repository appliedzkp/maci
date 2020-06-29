import {
    PubKey,
    PrivKey,
} from 'maci-domainobjs'

import {
    genPubKey,
} from 'maci-crypto'

import { exec } from './utils'

describe('genMaciKeypair CLI subcommand', () => {
    const command = 'node ../cli/build/index.js genMaciKeypair'

    it('genMaciKeypair should output a random private key and public key', async () => {
        const output = exec(command).stdout
        const output2 = exec(command).stdout

        const lines = output.split('\n')
        const lines2 = output2.split('\n')

        // Invoking the same command twice should result in different private
        // keys
        expect(lines[0]).not.toEqual(lines2[0])

        const sk = PrivKey.unserialize(lines[0].split(' ')[2])
        expect(sk instanceof PrivKey).toBeTruthy()

        const pk = PubKey.unserialize(lines[1].split(' ')[3])
        expect(pk instanceof PubKey).toBeTruthy()

        const pk2 = genPubKey(sk.rawPrivKey)
        expect(pk.rawPubKey[0].toString()).toEqual(pk2[0].toString())
        expect(pk.rawPubKey[1].toString()).toEqual(pk2[1].toString())
    })
})
