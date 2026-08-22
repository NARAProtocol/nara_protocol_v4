// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtSecurityPrintV2
/// @notice Clean, institutional security-printing motifs and collection banner for NARA Position NFTs.
contract NARAArtSecurityPrintV2 {
    using Strings for uint256;

    string internal constant BG = "#07090A";
    string internal constant IVORY = "#F4EFE6";
    string internal constant PURE_WHITE = "#FFFFFF";
    string internal constant MUTED = "#8E95A5";
    string internal constant COBALT = "#0052FF";

    uint256 public constant SECURITY_PRINT_VERSION = 2;

    function securityLayer(
        uint8 tier,
        uint256 seed,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        string calldata col
    ) external pure returns (string memory) {
        tier;
        seed;
        tokenId;
        positionId;
        createdEpoch;
        col;
        return ""; // Clean, uncluttered face — no noisy microprint spam
    }

    function moduleOverlay(uint8 moduleIdx, uint8 tier, string calldata col)
        external
        pure
        returns (string memory)
    {
        tier;
        moduleIdx;
        col;
        return "";
    }

    function collectionSVG() external pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><radialGradient id="bglow" cx="75%" cy="50%" r="50%"><stop offset="0%" stop-color="#0052FF" stop-opacity="0.25"/><stop offset="100%" stop-color="#07090A" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="#0B0D10"/><rect width="1600" height="900" fill="url(#bglow)"/>',
            '<g transform="translate(1200, 450)"><circle cx="0" cy="0" r="220" fill="none" stroke="#202630" stroke-width="2"/><circle cx="0" cy="0" r="160" fill="none" stroke="#0052FF" stroke-width="3" opacity="0.8" stroke-dasharray="12 8"/><circle cx="0" cy="0" r="110" fill="#0A0C10" stroke="#0052FF" stroke-width="4.5"/><g stroke="', IVORY, '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M-32 48 L-32 -48"/><path d="M32 48 L32 -48"/><path d="M-32 -48 L32 48"/></g><circle cx="0" cy="0" r="8" fill="#0052FF"/></g>',
            '<text x="120" y="420" fill="', PURE_WHITE, '" font-family="\'Satoshi\', \'Inter\', sans-serif" font-size="160" font-weight="900" letter-spacing="4">NARA</text>',
            '<text x="128" y="510" fill="#0052FF" font-family="\'IBM Plex Mono\', monospace" font-size="36" font-weight="800" letter-spacing="6">PROOF OF POSITION</text>',
            '<text x="128" y="565" fill="', MUTED, '" font-family="\'IBM Plex Mono\', monospace" font-size="20" font-weight="600" letter-spacing="4">BASE MAINNET // TOKEN-BOUND ASSETS</text></svg>'
        );
    }
}
