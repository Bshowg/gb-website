import { NextApiRequest, NextApiResponse } from 'next';
import { createMarket, matchOrder, resolveOutcome } from '../../utils/simulation';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'POST':
      return handlePost(req, res);
    case 'PUT':
      return handlePut(req, res);
    case 'PATCH':
      return handlePatch(req, res);
    default:
      res.setHeader('Allow', ['POST', 'PUT', 'PATCH']);
      return res.status(405).end(`Method ${method} Not Allowed`);
  }
}

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { action, data } = req.body;

  switch (action) {
    case 'createMarket':
      const market = createMarket(data);
      return res.status(201).json(market);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}

function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const { action, data } = req.body;

  switch (action) {
    case 'matchOrder':
      const order = matchOrder(data);
      return res.status(200).json(order);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}

function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const { action, data } = req.body;

  switch (action) {
    case 'resolveOutcome':
      const outcome = resolveOutcome(data);
      return res.status(200).json(outcome);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
