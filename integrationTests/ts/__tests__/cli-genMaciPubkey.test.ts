import {
    PubKey,
    PrivKey,
} from 'maci-domainobjs'

import { 
    genPubKey,
} from 'maci-crypto'

import { exec } from './utils'

describe('genMaciPubkey CLI subcommand', () => {
    const command = 'node ../cli/build/index.js genMaciKeypair'

    it('genMaciPubkey should output a correct public key', async () => {
        const output = exec(command).stdout
        const lines = output.split('\n')

        const sk = lines[0].split(' ')[2]
        const pk = lines[1].split(' ')[3]

        const command2 = 'node ../cli/build/index.js genMaciPubkey -sk ' + sk
        const output2 = exec(command2).stdout.trim()

        expect(output2).toEqual(pk)

        const unserialisedPrivkey = PrivKey.unserialize(sk)
        const pk2 = genPubKey(unserialisedPrivkey.rawPrivKey)
        const unserializedPk = PubKey.unserialize(pk)
        expect(unserializedPk.rawPubKey[0].toString()).toEqual(pk2[0].toString())
        expect(unserializedPk.rawPubKey[1].toString()).toEqual(pk2[1].toString())
    })
})
