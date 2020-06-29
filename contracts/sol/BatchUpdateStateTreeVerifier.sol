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
        vk.alfa1 = Pairing.G1Point(uint256(20256395195804460760597066734813093562566468316531099509297909321254820794820), uint256(5404260041836712794643972189519673924018985341593559007589261416284622633360));
        vk.beta2 = Pairing.G2Point([uint256(18445401308103692644322279549712090350971146246262073588660850579379497416467), uint256(1641041828596924364067389797133746557691847559915870848111460823330483156771)], [uint256(15749513497576674771931681095320252692262777951005000462240767994876759887321), uint256(1155140917747334679210193404048570258771686117271638362322306051457401891568)]);
        vk.gamma2 = Pairing.G2Point([uint256(3757079058433355319325359908000282022559056024163134187586451392198888861401), uint256(13850544266831508331510460125011823905670299025897158678463947296635570882706)], [uint256(9549722561996631993970065612349732670468315128090850767160111548416525052289), uint256(11011789334753725784666548084637693324906789246193975048357215443729868457682)]);
        vk.delta2 = Pairing.G2Point([uint256(1518933395376090836309017632752133478648528783061166698705017634751166771965), uint256(2684290078403891044872863000454236525711864544203986433779983481374290878163)], [uint256(20011121626201557607518792480370830936117100865482781983973928327077419830491), uint256(14431313652290747834984919387862218499486987867824456399157209052828721813094)]);
        vk.IC[0] = Pairing.G1Point(uint256(21075450497513470474444794868918756966483730544954487963588969183408499804948), uint256(1678707676925736396499494264373292508098697952979349594716973233025196236238));
        vk.IC[1] = Pairing.G1Point(uint256(18526864657581887222625710837627648855130635225148863685137015622028909281772), uint256(15979121490703330899608863944851614239111920165703087408952610722650651079377));
        vk.IC[2] = Pairing.G1Point(uint256(6132217728031875943186262540154545457015704415486125924930033898898031383889), uint256(7262812358533367510896846855517857625409599661301894114917372865427188963831));
        vk.IC[3] = Pairing.G1Point(uint256(2036928236531303398205390759542476650619564404252141609263893414148226143462), uint256(13443521051855811527602829989802907559766666194342155579958509978113626361390));
        vk.IC[4] = Pairing.G1Point(uint256(8269597201819447957460844330659215216189534602065471525975784884305436094697), uint256(3680728343166161916028300663924803751952294652292515292351028338286213626022));
        vk.IC[5] = Pairing.G1Point(uint256(3389747835454138325870774805007385135566147665686153619524801122920631766934), uint256(11144096687734592801104095428849730953141151272316788239771460573230313965924));
        vk.IC[6] = Pairing.G1Point(uint256(14183460083173105911317763963975543781481588135449640234726205568624225526561), uint256(7307688335354438761854535662047841471126371840806535818588659710695435162254));
        vk.IC[7] = Pairing.G1Point(uint256(11129980871501450477510842142986017572402441467482233723385682516255240417494), uint256(9634992163873523245655111555567462465718257089008955951977774748958550002481));
        vk.IC[8] = Pairing.G1Point(uint256(472485711387274909203442142461190483789879779315118859256165423816053455933), uint256(15194942973870085782035301169774411488870978084814746962715923837950306341801));
        vk.IC[9] = Pairing.G1Point(uint256(20121608426821326698367384522065277813758610525655262698372592916176890100755), uint256(5071315923966715940950198268660697513386274867526819384197243151490029217870));
        vk.IC[10] = Pairing.G1Point(uint256(16922192850505395529447297810129405627194341200221429536060655135740240107714), uint256(4069307559794531984896854253185713771158066721813278376476282584195133734394));
        vk.IC[11] = Pairing.G1Point(uint256(9733160330064673404413290886661461292208673007839073627090943572733985508701), uint256(13531541700352195135324506175146619281709902207219521689541637854800341528056));
        vk.IC[12] = Pairing.G1Point(uint256(15733667097274874144928395492573420205500058487673310764636095516685253015713), uint256(8540427736437559163211785812160485399424087577958803171318168401800071700632));
        vk.IC[13] = Pairing.G1Point(uint256(18813498767797384515843934428291067411736214088261914300624275702976334024847), uint256(1882333384755532336300356143555348966973516953814358760624551998884037061208));
        vk.IC[14] = Pairing.G1Point(uint256(15476954211595110221226642912359601942038373061227290408629419513496073713290), uint256(11033960661943521904001305432876541090295212898071329711491969835065062552423));
        vk.IC[15] = Pairing.G1Point(uint256(7214551527154240557666369229312414249572658118458774239734207923827819378600), uint256(12400709759572770058122833233818030799943380087892599029776775496840233778326));
        vk.IC[16] = Pairing.G1Point(uint256(19818682192211154075415882474461446880332055119981208547657365272393293660595), uint256(19791395977106748321440266061042058323775257842196931970580090485928454498905));
        vk.IC[17] = Pairing.G1Point(uint256(20333601222827953777119346947432446184337051275066278009728413544912889020044), uint256(12662846464127919343340624299721911997988079588227519762735076783120232164621));
        vk.IC[18] = Pairing.G1Point(uint256(21573237111582574652309302962263861602754847039945640476471931313951579373824), uint256(12055903521627058124549815960511866510323368142961557112483491339458785148246));
        vk.IC[19] = Pairing.G1Point(uint256(8582317268179479477068658816294942842033920966647601557134662778052323392605), uint256(17862299608493648420760239319883016472096479504788240442904122982115443989399));
        vk.IC[20] = Pairing.G1Point(uint256(14978877275747713549531064403261893168832086312242253255881394360178019989730), uint256(2131562328041933719290940449666733207341668506238923344554576764072765993993));

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
