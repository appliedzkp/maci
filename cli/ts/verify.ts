import * as fs from 'fs'

import {
    genPerVOSpentVoiceCreditsCommitment,
    genTallyResultCommitment,
    genSpentVoiceCreditsCommitment,
} from 'maci-core'

import {
    maciContractAbi,
} from 'maci-contracts'

import {
    bigInt,
} from 'maci-crypto'

import {
    validateEthAddress,
    contractExists,
    calcQuinTreeDepthFromMaxLeaves,
} from './utils'

import * as ethers from 'ethers'

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.addParser(
        'verify',
        { addHelp: true },
    )
    parser.addArgument(
        ['-t', '--tally-file'],
        {
            required: true,
            type: 'string',
            help: 'A filepath in which to save the final vote tally and salt.',
        }
    )
}

const verify = async (args: any) => {
    // Read the tally file
    let contents
    try {
        contents = fs.readFileSync(args.tally_file, { encoding: 'utf8' })
    } catch {
        console.error('Error: unable to open ', args.tally_file)
        return
    }

    // Parse the tally file
    let data
    try {
        data = JSON.parse(contents)
    } catch {
        console.error('Error: unable to parse ', args.tally_file)
        return
    }

    // Check the results salt
    const validResultsSalt = data.results.salt && data.results.salt.match(/0x[a-fA-F0-9]+/)

    if (!validResultsSalt) {
        console.error('Error: invalid results salt')
        return
    }

    // Check the results commitment
    const validResultsCommitment = data.results.commitment && data.results.commitment.match(/0x[a-fA-F0-9]+/)

    if (!validResultsCommitment) {
        console.error('Error: invalid results commitment format')
        return
    }

    // Ensure that the length of data.results.tally is a square root of 2
    const depth = calcQuinTreeDepthFromMaxLeaves(data.results.tally.length)
    if (Math.floor(depth).toString() !== depth.toString()) {
        console.error('Error: invalid results tally field length')
        return
    }

    // Verify that the results commitment matches the output of
    // genTallyResultCommitment()
    const tally = data.results.tally.map(bigInt)
    const salt = bigInt(data.results.salt)
    const resultsCommitment = bigInt(data.results.commitment)

    const expectedResultsCommitment = genTallyResultCommitment(tally, salt, depth)
    if (expectedResultsCommitment.toString() === resultsCommitment.toString()) {
        console.log('The results commitment in the specified file is correct given the tally and salt')
    } else {
        console.error('Error: the results commitment in the specified file is incorrect')
        return
    }

    // Check the total spent voice credits salt
    const validTvcSalt = data.totalVoiceCredits.salt && data.totalVoiceCredits.salt.match(/0x[a-fA-F0-9]+/)

    if (!validTvcSalt) {
        console.error('Error: invalid total spent voice credits results salt')
        return
    }

    // Check the total spent voice credits commitment
    const validTvcCommitment = data.totalVoiceCredits.commitment && data.totalVoiceCredits.commitment.match(/0x[a-fA-F0-9]+/)

    if (!validTvcCommitment) {
        console.error('Error: invalid total spent voice credits commitment format')
        return
    }

    // Verify that the total spent voice credits commitment matches the output of
    // genSpentVoiceCreditsCommitment()
    const tvcSpent = bigInt(data.totalVoiceCredits.spent)
    const tvcSalt = bigInt(data.totalVoiceCredits.salt)
    const tvcCommitment = bigInt(data.totalVoiceCredits.commitment)
    const expectedTvcCommitment = genSpentVoiceCreditsCommitment(tvcSpent, tvcSalt)
    if (expectedTvcCommitment.toString() === tvcCommitment.toString()) {
        console.log('The total spent voice credit commitment in the specified file is correct given the tally and salt')
    } else {
        console.error('Error: the total spent voice credit commitment in the specified file is incorrect')
        return
    }

    const pvcTally = data.totalVoiceCreditsPerVoteOption.tally.map((x) => bigInt(x))
    const pvcSalt = bigInt(data.totalVoiceCreditsPerVoteOption.salt)
    const pvcCommitment = bigInt(data.totalVoiceCreditsPerVoteOption.commitment)

    const expectedPvcCommitment = genPerVOSpentVoiceCreditsCommitment(pvcTally, pvcSalt, depth)

    if (expectedPvcCommitment.toString() === pvcCommitment.toString()) {
        console.log('The per vote option spent voice credit commitment in the specified file is correct given the tally and salt')
    } else {
        console.error('Error: the per vote option spent voice credit commitment in the specified file is incorrect')
        return
    }

    const maciAddress = data.maci

    // MACI contract
    if (!validateEthAddress(maciAddress)) {
        console.error('Error: invalid MACI contract address')
        return
    }

    // Ethereum provider
    const ethProvider = data.provider
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)

    try {
        await provider.getBlockNumber()
    } catch {
        console.error('Error: unable to connect to the Ethereum provider at', ethProvider)
        return
    }

    if (! (await contractExists(provider, maciAddress))) {
        console.error('Error: there is no contract deployed at the specified address')
        return
    }

    const maciContract = new ethers.Contract(
        maciAddress,
        maciContractAbi,
        provider,
    )

    const onChainResultsCommitment = bigInt((await maciContract.currentResultsCommitment()).toString())
    if (onChainResultsCommitment.toString() === expectedResultsCommitment.toString()) {
        console.log('The results commitment in the MACI contract on-chain is valid')
    } else {
        console.error('Error: the results commitment in the MACI contract does not match the expected commitment')
    }

    const onChainTvcCommitment = bigInt(
        (await maciContract.currentSpentVoiceCreditsCommitment()).toString()
    )
    if (onChainTvcCommitment.toString() === expectedTvcCommitment.toString()) {
        console.log('The total spent voice credit commitment in the MACI contract on-chain is valid')
    } else {
        console.error('Error: the total spent voice credit commitment in the MACI contract does not match the expected commitment')
    }

    const onChainPvcCommitment = bigInt(
        (await maciContract.currentPerVOSpentVoiceCreditsCommitment()).toString()
    )
    if (onChainPvcCommitment.toString() === expectedPvcCommitment.toString()) {
        console.log('The per vote option spent voice credit commitment in the MACI contract on-chain is valid')
    } else {
        console.error('Error: the per vote option spent voice credit commitment in the MACI contract does not match the expected commitment')
    }
}

export {
    verify,
    configureSubparser,
}
