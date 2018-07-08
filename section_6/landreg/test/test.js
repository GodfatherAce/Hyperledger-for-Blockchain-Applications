'use strict';

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const chai = require('chai');
const expect = chai.expect;
const dirtyChai = require('dirty-chai');
chai.use(dirtyChai);

const namespace = 'org.landreg';
const adminUserName = 'admin';
const adminEnrollmentSecret = 'adminpw';

const fixtures = yaml.safeLoad(fs.readFileSync(__dirname + '/fixtures.yml', 'utf8'));

/**
 * createIndividual
 */
function createIndividual(factory, data) {
    const individual = factory.newResource(namespace, 'Individual', data.passportNumber);
    individual.address = factory.newConcept(namespace, 'DutchAddress');
    individual.address.postalCode = data.address.postalCode;
    individual.address.addressLine = data.address.addressLine;
    individual.address.locality = data.address.locality;
    individual.gender = data.gender;
    return individual;
}

/**
 * createLandTitle
 */
function createLandTitle(factory, data, owner) {
    const landTitle = factory.newResource(namespace, 'LandTitle',  data.id);
    landTitle.address = factory.newConcept(namespace, 'DutchAddress');
    landTitle.owner = factory.newRelationship(namespace, 'Individual', owner.getIdentifier());
    landTitle.address.postalCode = data.address.postalCode;
    landTitle.address.addressLine = data.address.addressLine;
    landTitle.address.locality = data.address.locality;
    landTitle.area = data.area;
    landTitle.forSale = data.forSale;
    landTitle.price = data.price;
    landTitle.previousOwners = data.previousOwners || [];
    return landTitle;
}

describe('Unit tests', () => {
    // In-memory card store for testing so cards are not persisted to the file system
    let adminConnection;
    let businessNetworkConnection;
    let factory;
    let individualRegistry, landTitleRegistry;
    let individualA, individualB, landTitleA, landTitleB;

    before(async () => {
        const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

        // Embedded connection used for local testing
        const connectionProfile = {
            name: 'embedded',
            'x-type': 'embedded'
        };

        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: adminUserName });

        // PeerAdmin identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);

        const deployerCardName = 'PeerAdmin';
        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);

        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });

        let adminCardName;
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));

        // Install the Composer runtime for the new business network
        await adminConnection.install(businessNetworkDefinition);

        // Start the business network and configure an network admin identity
        const startOptions = {
            networkAdmins: [
                {
                    userName: adminUserName,
                    enrollmentSecret: adminEnrollmentSecret
                }
            ]
        };

        const adminCards = await adminConnection.start(businessNetworkDefinition.getName(), businessNetworkDefinition.getVersion(), startOptions);

        // Import the network admin identity for us to use
        adminCardName = `${adminUserName}@${businessNetworkDefinition.getName()}`;
        await adminConnection.importCard(adminCardName, adminCards.get(adminUserName));

        // Connect to the business network using the network admin identity
        await businessNetworkConnection.connect(adminCardName);

        // Set factory and registries
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        individualRegistry = await businessNetworkConnection.getParticipantRegistry(namespace + '.Individual');
        landTitleRegistry = await businessNetworkConnection.getAssetRegistry(namespace + '.LandTitle');
    });

    describe('Individual', () => {

        it('should create several individuals', async () => {
            // Create the Individuals
            individualA = createIndividual(factory, fixtures.individuals[0]);
            individualB = createIndividual(factory, fixtures.individuals[1]);

            await individualRegistry.addAll([individualA, individualB]);
        });
    });

    describe('LandTitle', () => {

        it('should create several landTitles', async () => {
            // create the LandTitle
            landTitleA = createLandTitle(factory, fixtures.landTitles[0], individualA);
            landTitleB = createLandTitle(factory, fixtures.landTitles[1], individualB);

            await landTitleRegistry.addAll([landTitleA, landTitleB]);
        });

        describe('unlockLandTitle', () => {

            it('should unlock locked landTitle', async () => {
                // Create the publish the unlockLandTitle transaction
                const unlockLandTitle = factory.newTransaction(namespace, 'UnlockLandTitle');
                unlockLandTitle.landTitle = factory.newRelationship(namespace, 'LandTitle', landTitleA.getIdentifier());

                // Submit the transaction
                await businessNetworkConnection.submitTransaction(unlockLandTitle);

                // get the landTitle and check if it's unlocked
                const storedLandTitle = await landTitleRegistry.get(landTitleA.getIdentifier());
                expect(storedLandTitle.forSale).to.be.true();
            });

            it('should not unlock unlocked landTitle');
        });

        describe('transferLandTitle', () => {

            it('should not transfer landTitle when newOwner is equal to current owner');

            it('should transfer unlocked landTitle');

            it('should not transfer locked landTitle');
        });
    });

    describe('Query', () => {

        it('should list ListLandTitlesBySize, and correctly filter by maximumArea');
    });
});
