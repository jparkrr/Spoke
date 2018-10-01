/* eslint-disable no-unused-expressions, consistent-return */
import { resolvers } from '../src/server/api/schema'
import { schema } from '../src/api/schema'
import { graphql } from 'graphql'
import { User, Organization, Campaign, CampaignContact, Assignment } from '../src/server/models/'
import { resolvers as campaignResolvers } from '../src/server/api/campaign'
import { getContext, setupTest, cleanupTest } from './test_helpers'
import { makeExecutableSchema } from 'graphql-tools'

const mySchema = makeExecutableSchema({
  typeDefs: schema,
  resolvers,
  allowUndefinedInResolve: true
})

const rootValue = {}

// data items used across tests

let testAdminUser
let testInvite
let testOrganization
let testCampaign
let testTexterUser
let testContact

// data creation functions

async function createUser(
  userInfo = {
    auth0_id: 'test123',
    first_name: 'TestUserFirst',
    last_name: 'TestUserLast',
    cell: '555-555-5555',
    email: 'testuser@example.com'
  }
) {
  const user = new User(userInfo)
  try {
    await user.save()
    console.log('created user')
    console.log(user)
    return user
  } catch (err) {
    console.error('Error saving user')
    return false
  }
}

async function createContact() {
  const campaignId = testCampaign.data.createCampaign.id

  const contact = new CampaignContact({
    first_name: 'Ann',
    last_name: 'Lewis',
    cell: '5555555555',
    zip: '12345',
    campaign_id: campaignId
  })
  try {
    await contact.save()
    console.log('created contact')
    console.log(contact)
    return contact
  } catch (err) {
    console.error('Error saving contact: ', err)
    return false
  }
}

async function createInvite() {
  const inviteQuery = `mutation {
    createInvite(invite: {is_valid: true}) {
      id
    }
  }`
  const context = getContext()
  try {
    const invite = await graphql(mySchema, inviteQuery, rootValue, context)
    return invite
  } catch (err) {
    console.error('Error creating invite')
    return false
  }
}

async function createOrganization() {
  const user = testAdminUser
  const name = 'Testy test organization'
  const userId = TODO
  const inviteId = testInvite.data.createInvite.id
  
  const context = getContext({ user })

  const orgQuery = `mutation createOrganization($name: String!, $userId: String!, $inviteId: String!) {
    createOrganization(name: $name, userId: $userId, inviteId: $inviteId) {
      id
      uuid
      name
      threeClickEnabled
      textingHoursEnforced
      textingHoursStart
      textingHoursEnd
    }
  }`

  const variables = {
    userId,
    name,
    inviteId
  }

  try {
    const org = await graphql(mySchema, orgQuery, rootValue, context, variables)
    return org
  } catch (err) {
    console.error('Error creating organization')
    return false
  }
}

async function createCampaign() {
  const user = testAdminUser
  const title = 'test campaign'
  const description = 'test description'
  const organizationId = testOrganization.data.createOrganization.id
  const contacts = []
  // TODO: replace the rest with a call to test lib
  const context = getContext({ user })

  const campaignQuery = `mutation createCampaign($input: CampaignInput!) {
    createCampaign(campaign: $input) {
      id
      title
      contacts {
        firstName
        lastName
      }
    }
  }`
  const variables = {
    input: {
      title,
      description,
      organizationId,
      contacts
    }
  }

  try {
    const campaign = await graphql(mySchema, campaignQuery, rootValue, context, variables)
    return campaign
  } catch (err) {
    console.error('Error creating campaign')
    return false
  }
}

async function createTexter() {
  const user = await createUser({
    auth0_id: 'test456',
    first_name: 'TestTexterFirst',
    last_name: 'TestTexterLast',
    cell: '555-555-6666',
    email: 'testtexter@example.com'
  })
  const joinQuery = `
  mutation joinOrganization($organizationUuid: String!) {
    joinOrganization(organizationUuid: $organizationUuid) {
      id
    }
  }`
  const variables = {
    organizationUuid: testOrganization.data.createOrganization.uuid
  }
  const context = getContext({ user: testTexterUser })
  await graphql(mySchema, joinQuery, rootValue, context, variables)
  return user
}

async function assignTexter() {
  const campaignEditQuery = `
  mutation editCampaign($campaignId: String!, $campaign: CampaignInput!) {
    editCampaign(id: $campaignId, campaign: $campaign) {
      id
      title
      description
      dueBy
      isStarted
      isArchived
      contactsCount
      datawarehouseAvailable
      customFields
      texters {
        id
        firstName
        assignment(campaignId:$campaignId) {
          contactsCount
          needsMessageCount: contactsCount(contactsFilter:{messageStatus:\"needsMessage\"})
        }
      }
      interactionSteps {
        id
        questionText
        script
        answerOption
        answerActions
        parentInteractionId
        isDeleted
      }
      cannedResponses {
        id
        title
        text
      }
    }
  }`
  const context = getContext({ user: testAdminUser })
  const updateCampaign = Object.assign({}, testCampaign.data.createCampaign)
  const campaignId = updateCampaign.id
  updateCampaign.texters = [
    {
      id: testTexterUser.id
    }
  ]
  delete updateCampaign.id
  delete updateCampaign.contacts
  const variables = {
    campaignId,
    campaign: updateCampaign
  }
  return await graphql(mySchema, campaignEditQuery, rootValue, context, variables)
})

// TODO: before each test we should reset this and have the db set up for testing.
beforeEach(async () => {
  await setupTest()
  testAdminUser = await createUser()
  
  testInvite = await createInvite()
  
  testOrganization = await createOrganization()
  
  testCampaign = await createCampaign()
  
  testContact = await createContact()
  
  testTexterUser = await createTexter()
  // TODO: Move methods from here and backend to testlib and just have wrappers in this file that provide the data.
  
  // But we also have things that used to be in tests. That should be in lib too, even if it's not in backend.
  // As long as it's necessary.
  await assignTexter()
  await createScript()
  await startCampaign()
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT)
afterEach(async () => await cleanupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)


// it('should save a campaign script composed of interaction steps', async() => {})

// it('should save some canned responses for texters', async() => {})

// it('should start the campaign', async() => {})

// TEST STUBS: MESSAGING

// it('should send an inital message to test contacts', async() => {})

describe('Campaign', () => {
  let organization

  beforeEach(async () => {
    organization = await new Organization({
      name: 'organization',
      texting_hours_start: 0,
      texting_hours_end: 0
    }).save()
  })

  describe('contacts', async () => {
    let campaigns
    let contacts

    beforeEach(async () => {
      campaigns = await Promise.all(
        [
          new Campaign({
            organization_id: organization.id,
            is_started: false,
            is_archived: false,
            due_by: new Date()
          }),
          new Campaign({
            organization_id: organization.id,
            is_started: false,
            is_archived: false,
            due_by: new Date()
          })
        ].map(async each => each.save())
      )

      contacts = await Promise.all(
        [
          new CampaignContact({
            campaign_id: campaigns[0].id,
            cell: '',
            message_status: 'closed'
          }),
          new CampaignContact({
            campaign_id: campaigns[1].id,
            cell: '',
            message_status: 'closed'
          })
        ].map(async each => each.save())
      )
    })

    test('resolves contacts', async () => {
      const results = await campaignResolvers.Campaign.contacts(campaigns[0])
      expect(results).toHaveLength(1)
      expect(results[0].campaign_id).toEqual(campaigns[0].id)
    })

    test('resolves contacts count', async () => {
      const results = await campaignResolvers.Campaign.contactsCount(campaigns[0])
      expect(results).toEqual(1)
    })

    test('resolves contacts count when empty', async () => {
      const campaign = await new Campaign({
        organization_id: organization.id,
        is_started: false,
        is_archived: false,
        due_by: new Date()
      }).save()
      const results = await campaignResolvers.Campaign.contactsCount(campaign)
      expect(results).toEqual(0)
    })
  })

  describe('unassigned contacts', () => {
    let campaign

    beforeEach(async () => {
      campaign = await new Campaign({
        organization_id: organization.id,
        is_started: false,
        is_archived: false,
        due_by: new Date()
      }).save()
    })

    test('resolves unassigned contacts when true', async () => {
      const contact = await new CampaignContact({
        campaign_id: campaign.id,
        message_status: 'closed',
        cell: ''
      }).save()

      const results = await campaignResolvers.Campaign.hasUnassignedContacts(campaign)
      expect(results).toEqual(true)
    })

    test('resolves unassigned contacts when false with assigned contacts', async () => {
      const user = await new User({
        auth0_id: 'test123',
        first_name: 'TestUserFirst',
        last_name: 'TestUserLast',
        cell: '555-555-5555',
        email: 'testuser@example.com'
      }).save()

      const assignment = await new Assignment({
        user_id: user.id,
        campaign_id: campaign.id
      }).save()

      const contact = await new CampaignContact({
        campaign_id: campaign.id,
        assignment_id: assignment.id,
        message_status: 'closed',
        cell: ''
      }).save()

      const results = await campaignResolvers.Campaign.hasUnassignedContacts(campaign)
      expect(results).toEqual(false)
    })

    test('resolves unassigned contacts when false with no contacts', async () => {
      const results = await campaignResolvers.Campaign.hasUnassignedContacts(campaign)
      expect(results).toEqual(false)
    })
  })
})
