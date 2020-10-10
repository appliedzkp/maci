import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'

import {
    hashLeftRight,
    hash5,
} from 'maci-crypto'

const genZeroesContract = (
    contractName: string,
    zeroVal: BigInt,
    hashLength: number,
    numZeroes: number,
    comment: string,
): string => {

    assert(hashLength === 2 || hashLength === 5)

    const template = fs.readFileSync(
        path.join(
            __dirname,
            '..',
            'ts',
            'MerkleZeroes.sol.template',
        ),
    ).toString()

    const zeroes: BigInt[] = [zeroVal]
    for (let i = 1; i < numZeroes; i ++) {
        const z = zeroes[i - 1]
        let hashed: BigInt
        if (hashLength === 2) {
            hashed = hashLeftRight(z, z)
        } else {
            hashed = hash5([z, z, z, z, z])
        }
        zeroes.push(hashed)
    }

    let z = ''
    for (let i = 0; i < zeroes.length; i ++) {
        z += `        zeroes[${i}] = uint256(${zeroes[i]});\n`
    }

    const generated = template
        .replace('<% CONTRACT_NAME %>', contractName)
        .replace('<% NUM_ZEROES %>', numZeroes.toString())
        .replace('<% ZEROES %>', '        ' + z.trim())
        .replace('<% COMMENT %>', comment)
    
    return generated
}


if (require.main === module) {
    const contractName = process.argv[2]
    const zero = BigInt(process.argv[3])
    const hashLength = Number(process.argv[4])
    const numZeroes = Number(process.argv[5])
    const comment = process.argv[6]

    const generated = genZeroesContract(contractName, zero, hashLength, numZeroes, comment)
    console.log(generated)
}

export {
    genZeroesContract,
}
