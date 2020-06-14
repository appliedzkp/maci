// Copyright 2017 Christian Reitwiessner
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// 2019 OKIMS

pragma solidity ^0.5.0;

library Pairing {

    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero. 
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {

        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return The sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {

        uint256[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-add-failed");
    }

    /*
     * @return The product of a point on G1 and a scalar, i.e.
     *         p == p.scalar_mul(1) and p.plus(p) == p.scalar_mul(2) for all
     *         points p.
     */
    function scalar_mul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {

        uint256[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require (success,"pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {

        G1Point[4] memory p1 = [a1, b1, c1, d1];
        G2Point[4] memory p2 = [a2, b2, c2, d2];

        uint256 inputSize = 24;
        uint256[] memory input = new uint256[](inputSize);

        for (uint256 i = 0; i < 4; i++) {
            uint256 j = i * 6;
            input[j + 0] = p1[i].X;
            input[j + 1] = p1[i].Y;
            input[j + 2] = p2[i].X[0];
            input[j + 3] = p2[i].X[1];
            input[j + 4] = p2[i].Y[0];
            input[j + 5] = p2[i].Y[1];
        }

        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas, 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-opcode-failed");

        return out[0] != 0;
    }
}

contract BatchUpdateStateTreeVerifier {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[21] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(20356340715623295586847303426352669780037394263753633000377527017555877605768), uint256(3898367462948835409938511459417377796756860321831592407835306258754845581321));
        vk.beta2 = Pairing.G2Point([uint256(16094960537208361737301392271984797218479298398509424042073896569796474118974), uint256(11608931405110766436644419351845731786484777378445980196099899008355849498616)], [uint256(7673269377305470960504119403559364128006452580633359584019756278301725000799), uint256(6488842619973457949057011916643940285353452377479016378282020241073462066876)]);
        vk.gamma2 = Pairing.G2Point([uint256(7986759383597082666670629021274565146870887291381283359571168507781837316548), uint256(16237237685684140129375353290103749357392085658084969290678456985021352034181)], [uint256(2915552934806357251697741242233438431578648960726654019349742551801065703082), uint256(2546939540998607702109339010297918123935960091465018271541323097277153501655)]);
        vk.delta2 = Pairing.G2Point([uint256(1669962291379357372558378853121483947434761047026651028751434462907163005029), uint256(9230949755640174220412156057264071028068448729643553870522838733012640654482)], [uint256(3372414627181361524803350761475872884087808093885447823730123804757173318106), uint256(4820997014310862197981977073720740997547313902040479945975909915384904363471)]);
        vk.IC[0] = Pairing.G1Point(uint256(4562568743700908173648369316963958211155982126049417677742644864897788263743), uint256(18141116554232716846790154550387584256619237962195086453262957576616840864599));
        vk.IC[1] = Pairing.G1Point(uint256(21054869450181981520711967864699433128116393897996308535545903748869987152953), uint256(1641663413637480287273347050722933537114633279536777777262845228137929801911));
        vk.IC[2] = Pairing.G1Point(uint256(9778655294661765329491163255804119859283681714182088267045932959612170781175), uint256(15392153132463522980041975637551042245374722210682846503083114225010130003864));
        vk.IC[3] = Pairing.G1Point(uint256(14796691706165918571732955051875033917761236572811176666853220780392205289246), uint256(16055693147961683434671991266661174405605505885531158271088321495257600054891));
        vk.IC[4] = Pairing.G1Point(uint256(13462018321737983196276588043923640545197393979309137351693133302827776867636), uint256(12538300262054913309786218621660152935587751809088833165058772780780792808840));
        vk.IC[5] = Pairing.G1Point(uint256(20154129421033115951979567848144122940157478944187528177660555457232198450855), uint256(21750189878307656178921041632060829906977028209213241009571070711550589996771));
        vk.IC[6] = Pairing.G1Point(uint256(12876087508617167271180014090843663297801696680047857258735701345965286891478), uint256(261375605670116517977795314420120877187859134381825002061108767546408050742));
        vk.IC[7] = Pairing.G1Point(uint256(3999732741418489018228551807936807996959793934231966251712566032049147108335), uint256(9117509259391792407588336252893003320436899062335451599097256664981768993194));
        vk.IC[8] = Pairing.G1Point(uint256(16529804462097642619338660879016905987004385179490403145306873424253038625331), uint256(21657780203690018309194829903948403993651620691925096475580136223349302871983));
        vk.IC[9] = Pairing.G1Point(uint256(19145653887577798868901248270296309562362361139290972329201569919878377436113), uint256(13047067809083125469917336853086198147815834104599175389655311566046286111187));
        vk.IC[10] = Pairing.G1Point(uint256(8364314440931944300685486200271063171723877693210558177482802126892755275964), uint256(15013862450554609099281725675996589833352909139684827919119165925141152618433));
        vk.IC[11] = Pairing.G1Point(uint256(6186632109912227069841970599302217197718925718822371352697834789715359261671), uint256(11631753424650318425033286359207281572947046653176261095800982502683214760826));
        vk.IC[12] = Pairing.G1Point(uint256(18386268703851099865898864373317307332967697100013620918809243293886685220469), uint256(21585271090203820292976443888203916256474534580552397121867315926952326207928));
        vk.IC[13] = Pairing.G1Point(uint256(12632298046845800148205138054580288045440870774212728646376690662982103653606), uint256(21830112109771714550237807204949837608411528970156590451273876997215139136466));
        vk.IC[14] = Pairing.G1Point(uint256(7449562917890117531646288866307006207342824043041508775970296026965382736460), uint256(2893689924021430246268730893976548431727878311258317676577484862817583054412));
        vk.IC[15] = Pairing.G1Point(uint256(9173981716740692141596849598294697286232910769244855544283999845937264021616), uint256(15968914706600089853180502239370332634694439438851358636311288578434180830502));
        vk.IC[16] = Pairing.G1Point(uint256(20362350079343886008616649626522790447163528772915364177374069432338651815631), uint256(7316724986294858185613049451155197932993413383931569483343305848859427887244));
        vk.IC[17] = Pairing.G1Point(uint256(7043326788309813932059115390279128820365689357093163039831583377795846200715), uint256(11013972859103969268102241041215097048006674787144798356673123055623056756093));
        vk.IC[18] = Pairing.G1Point(uint256(19984163688171330353343349860215149031506286765266377237341597191176347247782), uint256(301515325064052428722594103309814523128393267481483070108638377057788789371));
        vk.IC[19] = Pairing.G1Point(uint256(21223404314119425113506636375791891152089835055522688335872537568803501389749), uint256(2625721563409695460805572569313355867535399004052346290301551124737209883911));
        vk.IC[20] = Pairing.G1Point(uint256(3645768974494052130714412769224685041328255716791232029887849706356220009147), uint256(2567772896375531950746587827718973260876984046996864953621828997520148653007));

    }
    
    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[20] memory input
    ) public view returns (bool) {

        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);

        VerifyingKey memory vk = verifyingKey();

        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);

        // Make sure that proof.A, B, and C are each less than the prime q
        require(proof.A.X < PRIME_Q, "verifier-aX-gte-prime-q");
        require(proof.A.Y < PRIME_Q, "verifier-aY-gte-prime-q");

        require(proof.B.X[0] < PRIME_Q, "verifier-bX0-gte-prime-q");
        require(proof.B.Y[0] < PRIME_Q, "verifier-bY0-gte-prime-q");

        require(proof.B.X[1] < PRIME_Q, "verifier-bX1-gte-prime-q");
        require(proof.B.Y[1] < PRIME_Q, "verifier-bY1-gte-prime-q");

        require(proof.C.X < PRIME_Q, "verifier-cX-gte-prime-q");
        require(proof.C.Y < PRIME_Q, "verifier-cY-gte-prime-q");

        // Make sure that every input is less than the snark scalar field
        for (uint256 i = 0; i < input.length; i++) {
            require(input[i] < SNARK_SCALAR_FIELD,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.plus(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        vk_x = Pairing.plus(vk_x, vk.IC[0]);

        return Pairing.pairing(
            Pairing.negate(proof.A),
            proof.B,
            vk.alfa1,
            vk.beta2,
            vk_x,
            vk.gamma2,
            proof.C,
            vk.delta2
        );
    }
}
