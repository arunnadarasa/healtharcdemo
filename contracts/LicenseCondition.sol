// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LicenseCondition
 * @notice Minimal bespoke license registry for CDR token/license policy mode.
 *
 * conditionData ABI:
 *   abi.encode(uint256 licenseId, bytes32 requiredScope)
 *
 * auxData ABI (reserved for future proofs/signals):
 *   abi.encode(address delegatedRequester)  // optional, pass 0x if unused
 */
contract LicenseCondition is Ownable {
    enum AuthCode {
        OK,
        LICENSE_MISSING,
        LICENSE_REVOKED,
        LICENSE_EXPIRED,
        REQUESTER_NOT_HOLDER,
        SCOPE_MISMATCH
    }

    struct License {
        address holder;
        bytes32 scope;
        uint64 expiresAt;
        bool revoked;
        uint64 issuedAt;
    }

    uint256 public nextLicenseId = 1;
    mapping(uint256 => License) public licenses;

    event LicenseIssued(
        uint256 indexed licenseId,
        address indexed holder,
        bytes32 indexed scope,
        uint64 expiresAt
    );
    event LicenseRevoked(uint256 indexed licenseId, address indexed revokedBy);
    event LicenseExtended(
        uint256 indexed licenseId,
        uint64 oldExpiresAt,
        uint64 newExpiresAt
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function issueLicense(
        address holder,
        bytes32 scope,
        uint64 expiresAt
    ) external onlyOwner returns (uint256 licenseId) {
        require(holder != address(0), "holder=0");
        require(expiresAt > block.timestamp, "expiresAt<=now");

        licenseId = nextLicenseId++;
        licenses[licenseId] = License({
            holder: holder,
            scope: scope,
            expiresAt: expiresAt,
            revoked: false,
            issuedAt: uint64(block.timestamp)
        });

        emit LicenseIssued(licenseId, holder, scope, expiresAt);
    }

    function revokeLicense(uint256 licenseId) external onlyOwner {
        License storage lic = licenses[licenseId];
        require(lic.holder != address(0), "missing");
        require(!lic.revoked, "already_revoked");
        lic.revoked = true;
        emit LicenseRevoked(licenseId, msg.sender);
    }

    function extendLicense(
        uint256 licenseId,
        uint64 newExpiresAt
    ) external onlyOwner {
        License storage lic = licenses[licenseId];
        require(lic.holder != address(0), "missing");
        require(!lic.revoked, "revoked");
        require(newExpiresAt > lic.expiresAt, "not_extended");
        uint64 old = lic.expiresAt;
        lic.expiresAt = newExpiresAt;
        emit LicenseExtended(licenseId, old, newExpiresAt);
    }

    function authorizationCode(
        address requester,
        uint256 licenseId,
        bytes32 requiredScope
    ) public view returns (AuthCode) {
        License memory lic = licenses[licenseId];
        if (lic.holder == address(0)) return AuthCode.LICENSE_MISSING;
        if (lic.revoked) return AuthCode.LICENSE_REVOKED;
        if (lic.expiresAt <= block.timestamp) return AuthCode.LICENSE_EXPIRED;
        if (lic.holder != requester) return AuthCode.REQUESTER_NOT_HOLDER;
        if (requiredScope != bytes32(0) && lic.scope != requiredScope) {
            return AuthCode.SCOPE_MISMATCH;
        }
        return AuthCode.OK;
    }

    function hasValidLicense(
        address requester,
        uint256 licenseId,
        bytes32 requiredScope
    ) external view returns (bool allowed, AuthCode code) {
        code = authorizationCode(requester, licenseId, requiredScope);
        allowed = (code == AuthCode.OK);
    }

    function isAuthorized(
        address requester,
        bytes calldata conditionData,
        bytes calldata /* auxData */
    ) external view returns (bool allowed, AuthCode code) {
        (uint256 licenseId, bytes32 requiredScope) = abi.decode(
            conditionData,
            (uint256, bytes32)
        );
        code = authorizationCode(requester, licenseId, requiredScope);
        allowed = (code == AuthCode.OK);
    }
}
