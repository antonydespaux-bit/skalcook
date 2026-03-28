/**
 * Spécification OpenAPI 3.0 pour ft-manager.
 * Accessible via GET /api/docs (JSON) et GET /api/docs/ui (Swagger UI).
 */

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ft-manager API',
    version: '1.0.0',
    description:
      'API de gestion des fiches recettes, ingrédients et utilisateurs pour ft-manager (SkalCook). ' +
      'Toutes les routes protégées requièrent un Bearer JWT dans le header Authorization.',
  },
  servers: [
    { url: '/api', description: 'API courante' },
    { url: '/api/v1', description: 'API v1 (alias)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Supabase obtenu via /auth/v1/token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Message d\'erreur' },
          details: { type: 'object', nullable: true },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['admin', 'cuisine', 'bar', 'directeur'] },
          client_id: { type: 'string', format: 'uuid' },
          nom: { type: 'string' },
        },
      },
      Fiche: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          nom: { type: 'string' },
          description: { type: 'string', nullable: true },
          instructions: { type: 'string', nullable: true },
          nb_portions: { type: 'integer', nullable: true },
          prix_ttc: { type: 'number', nullable: true },
          cout_portion: { type: 'number', nullable: true },
          perte: { type: 'number', nullable: true },
          photo_url: { type: 'string', nullable: true },
          archive: { type: 'boolean' },
          is_sub_fiche: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Ingredient: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          nom: { type: 'string' },
          prix_kg: { type: 'number', nullable: true },
          unite: { type: 'string', example: 'kg' },
          est_sous_fiche: { type: 'boolean' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/create-user': {
      post: {
        summary: 'Créer un utilisateur',
        description: 'Crée un utilisateur Supabase Auth et son profil. Requiert le rôle superadmin.',
        tags: ['Utilisateurs'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'role', 'client_id', 'nom'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: ['admin', 'cuisine', 'bar', 'directeur'] },
                  client_id: { type: 'string', format: 'uuid' },
                  nom: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Utilisateur créé avec succès' },
          400: { description: 'Payload invalide', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Accès refusé — superadmin requis', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Email déjà utilisé', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/invite-admin': {
      post: {
        summary: 'Inviter un administrateur',
        description: 'Envoie un lien magique d\'invitation à un admin. Requiert superadmin.',
        tags: ['Utilisateurs'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'client_id'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  client_id: { type: 'string', format: 'uuid' },
                  nom: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Invitation envoyée' },
          400: { description: 'Payload invalide' },
          401: { description: 'Non authentifié' },
          403: { description: 'Superadmin requis' },
        },
      },
    },
    '/admin/list-users': {
      get: {
        summary: 'Lister les utilisateurs d\'un établissement',
        description: 'Retourne tous les utilisateurs liés au client_id de l\'admin connecté.',
        tags: ['Admin'],
        responses: {
          200: {
            description: 'Liste des utilisateurs',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            },
          },
          401: { description: 'Non authentifié' },
          403: { description: 'Rôle admin requis' },
        },
      },
    },
    '/superadmin/list-users': {
      get: {
        summary: '[Superadmin] Lister tous les utilisateurs',
        tags: ['Superadmin'],
        responses: {
          200: { description: 'Liste globale des utilisateurs' },
          403: { description: 'Superadmin requis' },
        },
      },
    },
    '/superadmin/create-global-user': {
      post: {
        summary: '[Superadmin] Créer un utilisateur multi-tenant',
        tags: ['Superadmin'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'role', 'client_id', 'nom'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string' },
                  client_id: { type: 'string', format: 'uuid' },
                  nom: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Utilisateur créé' },
          400: { description: 'Payload invalide' },
          403: { description: 'Superadmin requis' },
        },
      },
    },
    '/superadmin/update-user': {
      post: {
        summary: '[Superadmin] Modifier un utilisateur',
        tags: ['Superadmin'],
        responses: { 200: { description: 'Utilisateur mis à jour' }, 403: { description: 'Superadmin requis' } },
      },
    },
    '/superadmin/delete-user': {
      post: {
        summary: '[Superadmin] Supprimer un utilisateur',
        tags: ['Superadmin'],
        responses: { 200: { description: 'Utilisateur supprimé' }, 403: { description: 'Superadmin requis' } },
      },
    },
    '/superadmin/update-client': {
      post: {
        summary: '[Superadmin] Modifier un établissement',
        tags: ['Superadmin'],
        responses: { 200: { description: 'Établissement mis à jour' }, 403: { description: 'Superadmin requis' } },
      },
    },
    '/superadmin/list-prospects': {
      get: {
        summary: '[Superadmin] Lister les prospects',
        tags: ['Superadmin'],
        responses: { 200: { description: 'Liste des prospects' }, 403: { description: 'Superadmin requis' } },
      },
    },
    '/superadmin/delete-prospect': {
      post: {
        summary: '[Superadmin] Supprimer un prospect',
        tags: ['Superadmin'],
        responses: { 200: { description: 'Prospect supprimé' }, 403: { description: 'Superadmin requis' } },
      },
    },
    '/avis-response': {
      post: {
        summary: 'Répondre à un avis',
        tags: ['Avis'],
        responses: { 200: { description: 'Réponse enregistrée' } },
      },
    },
    '/docs': {
      get: {
        summary: 'Spécification OpenAPI (JSON)',
        description: 'Retourne la spécification OpenAPI 3.0 de cette API.',
        tags: ['Documentation'],
        security: [],
        responses: {
          200: {
            description: 'Spec OpenAPI',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/docs/ui': {
      get: {
        summary: 'Swagger UI',
        description: 'Interface visuelle pour explorer et tester l\'API.',
        tags: ['Documentation'],
        security: [],
        responses: { 200: { description: 'Page HTML Swagger UI' } },
      },
    },
  },
}
