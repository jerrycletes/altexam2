const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Blog = require('../models/Blog');

let mongoServer;
let token;
let userId;
let blogId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Blog.deleteMany({});
});

describe('Auth Endpoints', () => {
  describe('POST /api/auth/signup', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toBe('john@example.com');
    });

    it('should not register user with existing email', async () => {
      await User.create({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        password: 'password123'
      });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'john@example.com',
          password: 'password456'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/signin', () => {
    it('should login existing user', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      
      token = res.body.data.token;
      userId = res.body.data.user._id;
    });

    it('should not login with wrong password', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'john@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Blog Endpoints', () => {
  beforeEach(async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        password: 'password123'
      });

    token = signupRes.body.data.token;
    userId = signupRes.body.data.user._id;
  });

  describe('POST /api/blogs', () => {
    it('should create a new blog in draft state', async () => {
      const res = await request(app)
        .post('/api/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'My First Blog',
          description: 'This is a test blog',
          tags: ['test', 'nodejs'],
          body: 'This is the body of my first blog post. It contains enough words to calculate reading time properly.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.state).toBe('draft');
      expect(res.body.data.title).toBe('My First Blog');
      expect(res.body.data.reading_time).toBeGreaterThan(0);
      
      blogId = res.body.data._id;
    });

    it('should not create blog without authentication', async () => {
      const res = await request(app)
        .post('/api/blogs')
        .send({
          title: 'Unauthorized Blog',
          body: 'This should fail'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should not create blog without required fields', async () => {
      const res = await request(app)
        .post('/api/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'No Body Blog'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/blogs/:id/state', () => {
    it('should update blog state to published', async () => {
      const blog = await Blog.create({
        title: 'Test Blog',
        body: 'Test body content',
        author: userId,
        state: 'draft'
      });

      const res = await request(app)
        .patch(`/api/blogs/${blog._id}/state`)
        .set('Authorization', `Bearer ${token}`)
        .send({ state: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.state).toBe('published');
    });

    it('should not allow non-owner to update blog state', async () => {
      const otherUser = await User.create({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        password: 'password123'
      });

      const blog = await Blog.create({
        title: 'Another Blog',
        body: 'Test body content',
        author: otherUser._id,
        state: 'draft'
      });

      const res = await request(app)
        .patch(`/api/blogs/${blog._id}/state`)
        .set('Authorization', `Bearer ${token}`)
        .send({ state: 'published' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/blogs/:id', () => {
    it('should update blog content', async () => {
      const blog = await Blog.create({
        title: 'Original Title',
        body: 'Original body',
        author: userId
      });

      const res = await request(app)
        .put(`/api/blogs/${blog._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title',
          body: 'Updated body content'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Title');
    });

    it('should not allow non-owner to update blog', async () => {
      const otherUser = await User.create({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        password: 'password123'
      });

      const blog = await Blog.create({
        title: 'Another Blog',
        body: 'Test body',
        author: otherUser._id
      });

      const res = await request(app)
        .put(`/api/blogs/${blog._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Hacked Title'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/blogs/:id', () => {
    it('should delete own blog', async () => {
      const blog = await Blog.create({
        title: 'Blog to Delete',
        body: 'This will be deleted',
        author: userId
      });

      const res = await request(app)
        .delete(`/api/blogs/${blog._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deletedBlog = await Blog.findById(blog._id);
      expect(deletedBlog).toBeNull();
    });

    it('should not allow non-owner to delete blog', async () => {
      const otherUser = await User.create({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        password: 'password123'
      });

      const blog = await Blog.create({
        title: 'Protected Blog',
        body: 'Cannot delete this',
        author: otherUser._id
      });

      const res = await request(app)
        .delete(`/api/blogs/${blog._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/blogs', () => {
    it('should get all published blogs', async () => {
      await Blog.create({
        title: 'Published Blog 1',
        body: 'Content 1',
        author: userId,
        state: 'published'
      });

      await Blog.create({
        title: 'Published Blog 2',
        body: 'Content 2',
        author: userId,
        state: 'published'
      });

      await Blog.create({
        title: 'Draft Blog',
        body: 'Draft content',
        author: userId,
        state: 'draft'
      });

      const res = await request(app).get('/api/blogs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blogs.length).toBe(2);
      expect(res.body.data.pagination).toHaveProperty('total');
    });

    it('should support pagination', async () => {
      for (let i = 1; i <= 25; i++) {
        await Blog.create({
          title: `Blog ${i}`,
          body: `Content ${i}`,
          author: userId,
          state: 'published'
        });
      }

      const res = await request(app)
        .get('/api/blogs')
        .query({ page: 2, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.blogs.length).toBe(10);
      expect(res.body.data.pagination.page).toBe(2);
    });

    it('should support search by title', async () => {
      await Blog.create({
        title: 'NodeJS Tutorial',
        body: 'Learn NodeJS',
        author: userId,
        state: 'published'
      });

      await Blog.create({
        title: 'Python Guide',
        body: 'Learn Python',
        author: userId,
        state: 'published'
      });

      const res = await request(app)
        .get('/api/blogs')
        .query({ search: 'nodejs' });

      expect(res.status).toBe(200);
      expect(res.body.data.blogs.length).toBe(1);
      expect(res.body.data.blogs[0].title).toContain('NodeJS');
    });

    it('should support ordering by read_count', async () => {
      await Blog.create({
        title: 'Blog A',
        body: 'Content A',
        author: userId,
        state: 'published',
        read_count: 10
      });

      await Blog.create({
        title: 'Blog B',
        body: 'Content B',
        author: userId,
        state: 'published',
        read_count: 50
      });

      const res = await request(app)
        .get('/api/blogs')
        .query({ orderBy: 'read_count', order: 'desc' });

      expect(res.status).toBe(200);
      expect(res.body.data.blogs[0].read_count).toBeGreaterThan(
        res.body.data.blogs[1].read_count
      );
    });
  });

  describe('GET /api/blogs/:id', () => {
    it('should get single published blog and increment read_count', async () => {
      const blog = await Blog.create({
        title: 'Single Blog',
        body: 'Single content',
        author: userId,
        state: 'published',
        read_count: 5
      });

      const res = await request(app).get(`/api/blogs/${blog._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Single Blog');
      expect(res.body.data.read_count).toBe(6);
      expect(res.body.data.author).toHaveProperty('first_name');
    });

    it('should not get draft blog', async () => {
      const blog = await Blog.create({
        title: 'Draft Blog',
        body: 'Draft content',
        author: userId,
        state: 'draft'
      });

      const res = await request(app).get(`/api/blogs/${blog._id}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/my-blogs', () => {
    it('should get user own blogs', async () => {
      await Blog.create({
        title: 'My Blog 1',
        body: 'Content 1',
        author: userId,
        state: 'draft'
      });

      await Blog.create({
        title: 'My Blog 2',
        body: 'Content 2',
        author: userId,
        state: 'published'
      });

      const res = await request(app)
        .get('/api/my-blogs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blogs.length).toBe(2);
    });

    it('should filter my blogs by state', async () => {
      await Blog.create({
        title: 'Draft 1',
        body: 'Content',
        author: userId,
        state: 'draft'
      });

      await Blog.create({
        title: 'Published 1',
        body: 'Content',
        author: userId,
        state: 'published'
      });

      const res = await request(app)
        .get('/api/my-blogs')
        .query({ state: 'draft' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.blogs.length).toBe(1);
      expect(res.body.data.blogs[0].state).toBe('draft');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/my-blogs');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should support pagination for my blogs', async () => {
      for (let i = 1; i <= 25; i++) {
        await Blog.create({
          title: `My Blog ${i}`,
          body: `Content ${i}`,
          author: userId
        });
      }

      const res = await request(app)
        .get('/api/my-blogs')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.blogs.length).toBe(10);
      expect(res.body.data.pagination.pages).toBe(3);
    });
  });
});

describe('Reading Time Calculation', () => {
  it('should calculate reading time correctly', async () => {
    const words = new Array(400).fill('word').join(' ');
    
    const res = await request(app)
      .post('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Reading Time Test',
        body: words
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reading_time).toBe(2); // 400 words / 200 wpm = 2 minutes
  });
});