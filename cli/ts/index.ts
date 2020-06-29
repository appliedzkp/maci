import * as argparse from 'argparse' 
import { 
    calcBinaryTreeDepthFromMaxLeaves,
    calcQuinTreeDepthFromMaxLeaves,
} from './utils'

import {
    genMaciKeypair,
    configureSubparser as configureSubparserForGenMaciKeypair,
} from './genMaciKeypair'

import {
    genMaciPubkey,
    configureSubparser as configureSubparserForGenMaciPubkey,
} from './genMaciPubkey'

import {
    create,
    configureSubparser as configureSubparserForCreate,
} from './create'

import {
    signup,
    configureSubparser as configureSubparserForSignup,
} from './signUp'

import {
    publish,
    configureSubparser as configureSubparserForPublish,
} from './publish'

import {
    processMessages,
    configureSubparser as configureSubparserForProcessMessages,
} from './process'

import {
    tally,
    configureSubparser as configureSubparserForTally,
} from './tally'

import {
    verify,
    configureSubparser as configureSubparserForVerify,
} from './verify'

const main = async () => {
    const parser = new argparse.ArgumentParser({ 
        description: 'Minimal Anti-Collusion Infrastructure',
    })

    const subparsers = parser.addSubparsers({
        title: 'Subcommands',
        dest: 'subcommand',
    })

    // Subcommand: genMaciPubkey
    configureSubparserForGenMaciPubkey(subparsers)

    // Subcommand: genMaciKeypair
    configureSubparserForGenMaciKeypair(subparsers)

    // Subcommand: create
    configureSubparserForCreate(subparsers)

    // Subcommand: signup
    configureSubparserForSignup(subparsers)

    // Subcommand: publish
    configureSubparserForPublish(subparsers)

    // Subcommand: process
    configureSubparserForProcessMessages(subparsers)

    // Subcommand: tally
    configureSubparserForTally(subparsers)

    // Subcommand: verify
    configureSubparserForVerify(subparsers)

    const args = parser.parseArgs()

    // Execute the subcommand method
    if (args.subcommand === 'genMaciKeypair') {
        await genMaciKeypair(args)
    } else if (args.subcommand === 'genMaciPubkey') {
        await genMaciPubkey(args)
    } else if (args.subcommand === 'create') {
        await create(args)
    } else if (args.subcommand === 'signup') {
        await signup(args)
    } else if (args.subcommand === 'publish') {
        await publish(args)
    } else if (args.subcommand === 'process') {
        await processMessages(args)
    } else if (args.subcommand === 'tally') {
        await tally(args)
    } else if (args.subcommand === 'verify') {
        await verify(args)
    }
}

if (require.main === module) {
    main()
}

export {
    calcBinaryTreeDepthFromMaxLeaves,
    calcQuinTreeDepthFromMaxLeaves,
}
