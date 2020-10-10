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

contract BatchUpdateStateTreeVerifierSmall {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alpha1;
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
        vk.alpha1 = Pairing.G1Point(uint256(2330624265251238666556223178332173182822557521523626177168998641145968924980),uint256(17392211713957850937888833760451652375835206406549329977904211810873962832951));
        vk.beta2 = Pairing.G2Point([uint256(21414039126616517076637647196354161349830831010682288687232867504514655787407),uint256(8311169810730693055563217890561629635042494224930982419442564246233830564848)], [uint256(10008576486130532300596940945115214826639165743047048655454797499451930487990),uint256(13619341864935351379601537486134796808636974519533558393426064848459748308268)]);
        vk.gamma2 = Pairing.G2Point([uint256(13032890587930586091355929423314680064215517516558915131975552459953093103306),uint256(2435101631154643938608286501167888283020155872270111372678512515793144768691)], [uint256(14291029082672216911600766950813440452611007186186864956848777987655359881162),uint256(1126392768447318758553985594209652467100983774857652039152392711790380824778)]);
        vk.delta2 = Pairing.G2Point([uint256(4151333741287160042682721836107643266848567622960723807121324540181965914812),uint256(5114788734325600304049153780005464095440752288070126332863515685947841907336)], [uint256(17587313085302458116157104641584786014885012894425138447621013277395387107194),uint256(15172125401887316259786897760990419339125482912223736266343383646237148174031)]);
        vk.IC[0] = Pairing.G1Point(uint256(498315007007782144906288684263229045932165574988191397433988852839197570738),uint256(13646772870484513767568824243980815326026637199067318100729259537883084562287));
        vk.IC[1] = Pairing.G1Point(uint256(15368785222019615988338465809409085645776871158929605438035245985428548251232),uint256(19304860473754158774317730400687685732369544847491418025599396073143915879352));
        vk.IC[2] = Pairing.G1Point(uint256(10477013396707548970588611063766481307694563648128394040670155546692095379210),uint256(17393366814751012746628821792182383575971271704963130308010803413302376120933));
        vk.IC[3] = Pairing.G1Point(uint256(1451572487630935013433810617536985676727958500269583395687412765216549729145),uint256(15710553626093324505077846141870777739261123760655385826510119352874624888782));
        vk.IC[4] = Pairing.G1Point(uint256(3103862300394848811488239098769888378334517797505605891887914263091578111921),uint256(14331239047860236378990332023202952403900786843411514916157393109847721468522));
        vk.IC[5] = Pairing.G1Point(uint256(4624018906104047657398462717340103493136909475226555463279762237704397495110),uint256(9348644240751523178578706836036887628144399636176145602558638307042289642862));
        vk.IC[6] = Pairing.G1Point(uint256(6912078153685890110236351031304475991689145703582917509614884877155537071940),uint256(13740810774477497231328036701429095743158802022859969026175518866173995242707));
        vk.IC[7] = Pairing.G1Point(uint256(16623452193219749573660077274583055150431633225214562340650422367702208857406),uint256(20157796812808705122060809652440019548093087264612442613827574629307633706715));
        vk.IC[8] = Pairing.G1Point(uint256(18385367703713886054047123235366497956686264624013083267034498309455848068001),uint256(7326244885770861474450556900144753741988339062940498040666366023860600234028));
        vk.IC[9] = Pairing.G1Point(uint256(2648343690076838264782471484529496412084283783744083855077953716530774837688),uint256(8592326186075083621233985940662637156976055860989911106120378796501658362671));
        vk.IC[10] = Pairing.G1Point(uint256(1828197891869026284189802724614269204504768698860301495176341937534998913813),uint256(21479338665706252141198473283419657866920440087805307252712514629272169146738));
        vk.IC[11] = Pairing.G1Point(uint256(19525594668588308867539465870937599855671342290516525760832599548740746737588),uint256(5996648620153380608420035656310163257313446514782030428505440782662830042595));
        vk.IC[12] = Pairing.G1Point(uint256(4852085450812087539770408366167929100553786398780915421580624783265979514787),uint256(19606744297610937055336968295646018267145660044700731598696887027796396643217));
        vk.IC[13] = Pairing.G1Point(uint256(19446331030744510938769949767418908523527227486850973523548645496818590263529),uint256(20783594099184310779420446416340794024157574090447260249778079489049603672674));
        vk.IC[14] = Pairing.G1Point(uint256(147332598433784626519696523131981095131742937673177855527545464929983435756),uint256(7371185003476241253457258115511265979082014439345959430231382495494739191980));
        vk.IC[15] = Pairing.G1Point(uint256(8222288542537560202631226491801816690062177004916114039787401062296210749539),uint256(17908212699695659907592270171158895237588268424579624390911923574636926902881));
        vk.IC[16] = Pairing.G1Point(uint256(16031924037009372686309955988254471145832625736532041570512022835880750973247),uint256(6369767666123317864958552991239488159093267965771914082770521562917179999956));
        vk.IC[17] = Pairing.G1Point(uint256(2777462440269112411189135616906766753364889211865115588240772329702583671372),uint256(4205879649296752366971927314980622072542877954874447403734872335743788957565));
        vk.IC[18] = Pairing.G1Point(uint256(4417723439979305036299461527672007020412750947731463313403931648439489708039),uint256(15464184700177323663425108540673981129568665550602742078454770236202970853853));
        vk.IC[19] = Pairing.G1Point(uint256(14732891939081052517371249077340099467655600355805139382813340529078174056092),uint256(9565848970250350720124611785930576249190837144298215044000317615976200234464));
        vk.IC[20] = Pairing.G1Point(uint256(9200646964937017985544692075682648098348702604989355937750148403157206780535),uint256(4292667016197116483174382869971362388284840413340240992120154575230675285109));

    }
    
    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory input
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
        //for (uint256 i = 0; i < input.length; i++) {
        for (uint256 i = 0; i < 20; i++) {
            require(input[i] < SNARK_SCALAR_FIELD,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.plus(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        vk_x = Pairing.plus(vk_x, vk.IC[0]);

        return Pairing.pairing(
            Pairing.negate(proof.A),
            proof.B,
            vk.alpha1,
            vk.beta2,
            vk_x,
            vk.gamma2,
            proof.C,
            vk.delta2
        );
    }
}
