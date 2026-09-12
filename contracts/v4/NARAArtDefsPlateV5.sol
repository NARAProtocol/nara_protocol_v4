// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title NARAArtDefsPlateV5
/// @notice Master luxury SVG defs, radial omnidirectional filters, and apex solar astrolabe decorations.
contract NARAArtDefsPlateV5 {
    function renderDefs(
        string memory gradC0,
        string memory gradC1,
        string memory gradC2,
        string memory hexGridColor,
        bool isApex
    ) external pure returns (string memory) {
        string memory apexExtras = isApex ? string.concat(
            '<radialGradient id="goldOmniShine" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#FFE082" stop-opacity="0.30"/><stop offset="40%" stop-color="#FFB300" stop-opacity="0.14"/><stop offset="80%" stop-color="#FF8F00" stop-opacity="0.04"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="goldSunburst" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFF59D" stop-opacity="0.85"/><stop offset="50%" stop-color="#FFB300" stop-opacity="0.45"/><stop offset="100%" stop-color="#FF6F00" stop-opacity="0"/></linearGradient>'
        ) : "";

        return string.concat(
            '<defs>',
            '<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="', (isApex ? "22" : "12"), '" flood-color="', (isApex ? "#FFB300" : "#000"), '" flood-opacity="', (isApex ? "0.75" : "0.9"), '"/></filter>',
            '<linearGradient id="frameGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="', gradC0,
            '"/><stop offset="25%" stop-color="', gradC1,
            '"/><stop offset="50%" stop-color="', gradC2,
            '"/><stop offset="75%" stop-color="', gradC1,
            '"/><stop offset="100%" stop-color="', gradC0, '"/></linearGradient>',
            apexExtras,
            '<pattern id="hexGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 12 0 L 24 6.9 L 24 20.7 L 12 27.6 L 0 20.7 L 0 6.9 Z" fill="none" stroke="', hexGridColor, '" stroke-width="', (isApex ? "1.0" : "0.75"), '"/></pattern>',
            '</defs>'
        );
    }

    function renderApexDecorations() external pure returns (string memory) {
        return string.concat(
            '<rect x="12" y="12" width="476" height="676" rx="23" fill="none" stroke="#FFF59D" stroke-width="1.5" opacity="0.75"/>',
            '<rect x="23" y="23" width="454" height="654" rx="16" fill="none" stroke="#FFB300" stroke-width="0.75" stroke-dasharray="8 4" opacity="0.6"/>',
            '<rect x="20" y="20" width="460" height="660" rx="18" fill="url(#goldOmniShine)"/>',
            '<path d="M 24 64 L 64 24 M 430 24 L 476 64 M 24 630 L 64 676 M 430 676 L 476 630" stroke="#FFF9C4" stroke-width="1.2"/>',
            '<g transform="translate(250,285)" opacity="0.8"><circle cx="0" cy="0" r="155" fill="url(#goldSunburst)"/><path d="M0 -155 V155 M-155 0 H155 M-110 -110 L110 110 M-110 110 L110 -110 M-59 -143 L59 143 M59 -143 L-59 143 M-143 -59 L143 59 M-143 59 L143 -59" stroke="#FFE082" stroke-width="1.2" opacity="0.55"/></g>'
        );
    }
}
